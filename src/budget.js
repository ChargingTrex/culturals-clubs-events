/**
 * Budget lifecycle: build it, get it sanctioned, run the event, settle it.
 *
 * The order is load-bearing and enforced here, not just in the UI.
 */
import { db, find, now, uid } from "./db.js";
import { conflict, invalid } from "./errors.js";

export const RECEIPT_THRESHOLD = 5000;
export const CONTINGENCY_PERCENT = 8;

export const STAGE_LABELS = {
  draft: "Draft",
  society_review: "With the Cultural Society",
  dean_review: "With the Dean",
  vc_review: "With the Vice-Chancellor",
  sanctioned: "Sanctioned",
  settled: "Settled",
  returned: "Returned for changes",
  rejected: "Rejected",
};

export const stageForGate = gate => ({
  cultural_society: "society_review", dean: "dean_review", vc: "vc_review",
}[gate]);

const sum = (lines, key) => lines.reduce((a, l) => a + (Number(l[key]) || 0), 0);
export const totalRequested = b => sum(b.lines, "amountRequested");
export const totalSanctioned = b => sum(b.lines, "amountSanctioned");
export const totalSpent = b => sum(b.lines, "amountSpent");

/** Either priced, or explicitly declared to need nothing. */
export const isReadyToSubmit = b => Boolean(b.isNil || b.lines.length);

/**
 * Requested amounts freeze once an approver holds the budget: editing under a
 * reviewer would mean they sanction something other than what they read. A return
 * reopens it, which is the point of returning.
 */
export const isEditable = b => ["draft", "returned", "rejected"].includes(b.stage);

/**
 * What settlement is waiting for, or null when it can proceed.
 *
 * Returned instead of a bare boolean because "not yet" has distinct causes and the
 * club needs to know which: waiting on an approver is somebody else's move,
 * waiting on the event is just the calendar.
 */
export function settlementWaitingOn(b) {
  if (b.stage === "settled") return "settled";
  if (b.stage !== "sanctioned") return "sanction";
  const event = find(db().events, b.eventId);
  if (!event) return null;
  if (!["live", "completed", "reported"].includes(event.status)) return "event";
  return null;
}

export const canSettle = b => settlementWaitingOn(b) === null;

export const settlementHint = b => ({
  sanction: "Not yet. The budget has to be sanctioned before spend is recorded against it.",
  event: "Not yet. Settle after the event has run — spend recorded against an event "
    + "that has not happened is spend against nothing.",
  settled: "Settled. Receipts stay attached to this event.",
}[settlementWaitingOn(b)] || null);

export function ensureBudget(eventId) {
  let budget = db().budgets.find(b => b.eventId === eventId);
  if (budget) return budget;
  budget = {
    id: uid("bg"), eventId, stage: "draft", lines: [], settledAt: null,
    isNil: false, nilReason: "", nilDeclaredAt: null, nilDeclaredByLabel: "",
  };
  db().budgets.push(budget);
  return budget;
}

function assertEditable(b) {
  if (!isEditable(b)) {
    throw conflict("BUDGET_LOCKED", "Budget is locked",
      `This budget is ${STAGE_LABELS[b.stage].toLowerCase()}. Requested amounts are `
      + "frozen once an approver holds it — editing under a reviewer would mean they "
      + "sanction something other than what they read.");
  }
}

export function addLine(budget, { head, amountRequested, basis = "lump_sum" }) {
  assertEditable(budget);
  const name = String(head || "").trim();
  if (!name) {
    throw invalid("BUDGET_LINE_HEAD_REQUIRED", "A head is required",
      "Name what the money is for.",
      [{ field: "head", code: "REQUIRED", message: "Give the line a head." }]);
  }
  const amount = Number(amountRequested);
  if (!Number.isFinite(amount) || amount < 0) {
    throw invalid("BUDGET_LINE_NEGATIVE", "Amount cannot be negative",
      `${amountRequested} is not a valid request.`,
      [{ field: "amount_requested", code: "NEGATIVE", message: "Use zero or more." }]);
  }
  if (budget.lines.some(l => l.head.toLowerCase() === name.toLowerCase())) {
    throw conflict("BUDGET_LINE_DUPLICATE_HEAD", "That head already exists",
      `“${name}” is already a line on this budget. Edit that line instead, so one `
      + "head does not appear twice in the settlement.");
  }
  const line = {
    id: uid("bl"), head: name, basis, amountRequested: amount,
    amountSanctioned: null, amountSpent: null, varianceNote: "", receipts: [],
  };
  budget.lines.push(line);
  // The two statements contradict each other; a priced line wins.
  if (amount > 0 && budget.isNil) clearNil(budget);
  return line;
}

export function updateLine(budget, line, { head, amountRequested, basis }) {
  assertEditable(budget);
  if (head !== undefined) {
    const name = String(head).trim();
    if (!name) {
      throw invalid("BUDGET_LINE_HEAD_REQUIRED", "A head is required",
        "Name what the money is for.");
    }
    if (budget.lines.some(l => l.id !== line.id
        && l.head.toLowerCase() === name.toLowerCase())) {
      throw conflict("BUDGET_LINE_DUPLICATE_HEAD", "That head already exists",
        `“${name}” is already a line on this budget.`);
    }
    line.head = name;
  }
  if (amountRequested !== undefined) {
    const amount = Number(amountRequested);
    if (!Number.isFinite(amount) || amount < 0) {
      throw invalid("BUDGET_LINE_NEGATIVE", "Amount cannot be negative",
        `${amountRequested} is not a valid request.`);
    }
    line.amountRequested = amount;
  }
  if (basis !== undefined) line.basis = basis;
  return line;
}

export function removeLine(budget, line) {
  // A hard delete is right here and nowhere else: an unsubmitted line is a draft
  // nobody has relied on. Once sanctioned, isEditable is false and this closes.
  assertEditable(budget);
  budget.lines = budget.lines.filter(l => l.id !== line.id);
  return budget;
}

export function declareNil(budget, { reason, ctx }) {
  assertEditable(budget);
  const text = String(reason || "").trim();
  if (text.length < 5) {
    throw invalid("BUDGET_NIL_REASON_REQUIRED", "A reason is required",
      "Say why the event needs no budget — the approver sees this instead of figures.",
      [{ field: "reason", code: "REQUIRED",
         message: "e.g. Venue is free and the club owns the equipment." }]);
  }
  const priced = budget.lines.filter(l => l.amountRequested > 0);
  if (priced.length) {
    throw conflict("BUDGET_NIL_HAS_LINES", "This budget asks for money",
      `Remove the priced lines first (${priced.map(l => l.head).join(", ")}). A budget `
      + "cannot both request an amount and declare it needs nothing.");
  }
  budget.isNil = true;
  budget.nilReason = text;
  budget.nilDeclaredAt = now();
  budget.nilDeclaredByLabel = ctx.displayName;
  return budget;
}

function clearNil(budget) {
  budget.isNil = false;
  budget.nilReason = "";
  budget.nilDeclaredAt = null;
  budget.nilDeclaredByLabel = "";
  return budget;
}

export function withdrawNil(budget) {
  assertEditable(budget);
  return clearNil(budget);
}

export const nilDeclaration = b => (b.isNil ? {
  head: "No budget required", reason: b.nilReason,
  declaredBy: b.nilDeclaredByLabel, declaredAt: b.nilDeclaredAt,
} : null);

/**
 * Everything blocking settlement, all of it at once — a treasurer fixing one
 * problem per round trip gives up and settles on paper.
 *
 * Empty before settlement is reachable: listing "enter what was spent" against a
 * draft presents the normal order of work as a fault.
 */
export function settlementProblems(budget) {
  if (!canSettle(budget) || budget.isNil) return [];
  const problems = [];
  if (!budget.lines.some(l => l.amountSpent != null)) {
    problems.push({ field: "lines", code: "NO_SPEND_ENTERED",
      message: "Enter what was actually spent on at least one line." });
  }
  for (const line of budget.lines) {
    if (line.amountSpent == null) continue;
    const current = line.receipts.filter(r => !r.supersededBy);
    if (line.amountSpent > RECEIPT_THRESHOLD && !current.length) {
      problems.push({ field: `lines.${line.id}.receipts`, code: "RECEIPT_REQUIRED",
        message: `“${line.head}” is over ${RECEIPT_THRESHOLD.toLocaleString("en-IN")}, `
          + "so it needs a receipt." });
    }
    if (line.amountSanctioned != null && line.amountSpent > line.amountSanctioned
        && !line.varianceNote.trim()) {
      problems.push({ field: `lines.${line.id}.variance_note`,
        code: "VARIANCE_NOTE_REQUIRED",
        message: `“${line.head}” is ${(line.amountSpent - line.amountSanctioned)
          .toLocaleString("en-IN")} over sanctioned. Record what caused it.` });
    }
  }
  return problems;
}

export function settle(budget, ctx) {
  if (budget.stage !== "sanctioned") {
    throw conflict("BUDGET_NOT_SANCTIONED", "Not ready to settle",
      `This budget is ${STAGE_LABELS[budget.stage].toLowerCase()}.`);
  }
  const waiting = settlementWaitingOn(budget);
  if (waiting === "event") {
    throw conflict("BUDGET_EVENT_NOT_RUN", "Event has not run yet",
      "Close the event first; spend is settled against what happened.");
  }
  if (budget.isNil) {
    // Nothing was spent because nothing was asked for. It still has to be closed
    // off, or the event sits on the Dean's chasing list forever.
    budget.stage = "settled";
    budget.settledAt = now();
    return budget;
  }
  const problems = settlementProblems(budget);
  if (problems.length) {
    throw invalid("BUDGET_SETTLEMENT_INCOMPLETE", "Cannot settle yet",
      "Some lines still need spend, a receipt or a reason.", problems);
  }
  budget.stage = "settled";
  budget.settledAt = now();
  return budget;
}

export function attachReceipt(line, { fileName, byteSize = 0, amount = null }) {
  const receipt = {
    id: uid("rc"), fileName, byteSize, amount, supersededBy: null, at: now(),
  };
  line.receipts.push(receipt);
  return receipt;
}

export function seedFromTemplate(budget, template, expectedAttendance) {
  budget.lines = [];
  let subtotal = 0;
  for (const line of template.lines) {
    const amount = line.basis === "per_head"
      ? line.rate * Math.max(1, expectedAttendance)
      : line.rate;
    subtotal += amount;
    budget.lines.push({
      id: uid("bl"), head: line.head, basis: line.basis, amountRequested: amount,
      amountSanctioned: null, amountSpent: null, varianceNote: "", receipts: [],
    });
  }
  const contingency = Math.round(subtotal * CONTINGENCY_PERCENT / 100);
  if (contingency > 0) {
    budget.lines.push({
      id: uid("bl"), head: "Contingency", basis: "lump_sum",
      amountRequested: contingency, amountSanctioned: null, amountSpent: null,
      varianceNote: "", receipts: [],
    });
  }
  return budget;
}
