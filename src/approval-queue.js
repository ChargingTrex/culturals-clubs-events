/**
 * One approval queue, rendered for any gate.
 *
 * The four gate pages differ only in which stage they show and what they tell
 * the approver, so they share this. Each page still checks its own gate: holding
 * the Dean's queue does not make the VC's page yours.
 */
import { page, esc, inr, dateBox, fmtDate, fmtTime, routeTracker, showError, toast }
  from "./ui.js";
import * as api from "./api.js";
import { STAGE_LABELS, STAGE_WITH } from "./roles.js";

const ICON = { approve: "✓", return: "↩", reject: "✕" };

function budgetTable(r) {
  if (r.nilDeclaration) {
    return `<div class="note nil" style="margin-top:10px">
      <strong>${esc(r.nilDeclaration.head)}</strong>
      <p style="margin:6px 0 0">${esc(r.nilDeclaration.reason)}</p>
      <p class="small muted" style="margin:6px 0 0">Declared by
        ${esc(r.nilDeclaration.declaredBy)} — nothing to sanction.</p></div>`;
  }
  if (!r.lines.length) {
    return `<p class="note bad" style="margin-top:10px">No entries and no nil
      declaration — this should not have reached you.</p>`;
  }
  const earlier = r.canSanction && r.currentStage !== "dean";
  const total = key => r.lines.reduce((a, l) => a + (Number(l[key]) || 0), 0);
  return `<div class="table-wrap" style="margin-top:10px">
    <table class="sanction" style="min-width:330px"><thead><tr><th>Head</th>
      <th class="num">Requested</th>
      ${earlier ? `<th class="num">Sanctioned so far</th>` : ""}
      ${r.canSanction ? `<th class="num">Your sanction</th>` : ""}</tr></thead>
    <tbody>${r.lines.map(l => `<tr><td>${esc(l.head)}</td>
      <td class="num">${inr(l.amountRequested)}</td>
      ${earlier ? `<td class="num">${inr(l.amountSanctioned ?? l.amountRequested)}</td>` : ""}
      ${r.canSanction ? `<td class="num"><input type="number" min="0"
        max="${l.amountSanctioned ?? l.amountRequested}"
        value="${l.amountSanctioned ?? l.amountRequested}"
        data-sanc="${r.id}:${l.id}" aria-label="Sanction for ${esc(l.head)}"
        style="width:110px;text-align:right"></td>` : ""}</tr>`).join("")}
      <tr><th>Total</th><th class="num">${inr(total("amountRequested"))}</th>
        ${earlier ? `<th class="num">${inr(r.lines.reduce((a, l) =>
          a + (l.amountSanctioned ?? l.amountRequested), 0))}</th>` : ""}
        ${r.canSanction ? `<th class="num" data-total="${r.id}"></th>` : ""}</tr>
    </tbody></table></div>
    <p class="small muted" style="margin-top:6px">${r.canSanction
      ? (earlier ? "You may reduce a head further, never raise it above what was "
          + "sanctioned before you."
        : "You may reduce a head, never raise it above what was asked for. Heads you "
          + "leave alone are sanctioned as requested.")
      : "You recommend on merit and the calendar; the Dean sanctions the figures."}</p>`;
}

function nextGates(r) {
  const at = r.stages.indexOf(r.currentStage);
  const after = r.stages.slice(at + 1);
  if (!after.length) {
    return `<p class="small next-gate">Yours is the last gate — approving publishes
      the event and opens registration.</p>`;
  }
  const why = stage => (stage === "vc" ? r.vcReason
    : stage === "management" ? r.managementReason : "");
  return `<p class="small next-gate">After you: ${after.map(s =>
    `${esc(STAGE_LABELS[s])}${why(s) ? ` (${esc(why(s))})` : ""}`).join(", then ")}.</p>`;
}

function card(r, { isDean }) {
  const last = r.stages[r.stages.length - 1] === r.currentStage;
  return `<li class="approval-card" data-request="${r.id}"
      data-event-title="${esc(r.eventTitle)}">
    <div class="event">
      ${dateBox(r.startsAt)}
      <div>
        <div class="row"><h3>${esc(r.eventTitle)}</h3>
          <span class="pill">${esc(r.club)}</span>
          ${r.requiresMfa ? `<span class="pill ok" title="Above the escalation threshold a
            decision needs a two-factor session. Pilot staff sign-ins count as
            verified.">Verified session</span>` : ""}
          ${r.clashes.length ? `<span class="pill bad">Venue clash</span>` : ""}</div>
        <p class="small muted">${esc(r.venue)} · ${fmtDate(r.startsAt)},
          ${fmtTime(r.startsAt)}–${fmtTime(r.endsAt)} · expecting
          ${r.expectedAttendance} · requesting <strong>${inr(r.amountRequested)}</strong>
          ${r.submittedByLabel ? ` · sent by ${esc(r.submittedByLabel)}` : ""}</p>
        ${routeTracker(r.route)}
        ${nextGates(r)}
        ${r.clashes.length ? `<p class="small clash-note">
          Overlaps ${r.clashes.map(c => `<b>${esc(c.title)}</b> (${esc(c.club)})`)
            .join(", ")} in the same venue, within the setup buffer.
          ${isDean ? `<a href="dean-venues.html">Resolve it under Venues</a> before
            approving.` : "The Dean resolves it under Venues before this can be "
            + "approved. You can still return it."}</p>` : ""}
        ${budgetTable(r)}
        ${r.steps.length ? `<ul class="history">${r.steps.map(s => `<li>
          <span class="h-icon ${esc(s.decision)}">${ICON[s.decision] || "·"}</span>
          <span><b>${esc(s.stageLabel)}</b> ${esc(s.decision === "approve"
            ? "approved" : s.decision === "return" ? "returned" : "rejected")}
            — ${esc(s.actorLabel)}, ${fmtDate(s.at)}
            ${s.comment ? `<br><q>${esc(s.comment)}</q>` : ""}</span></li>`).join("")}
          </ul>` : ""}
        <label for="c-${r.id}" style="margin-top:12px">Comment
          <span class="muted">(required to return or reject)</span></label>
        <textarea id="c-${r.id}" rows="2" data-comment="${r.id}"></textarea>
        <div id="m-${r.id}" class="decision-msg"></div>
        <div class="row" style="margin-top:10px">
          <button class="btn primary" data-go="approve:${r.id}">${last
            ? "Approve and publish" : "Approve"}</button>
          <button class="btn" data-go="return:${r.id}">Return for changes</button>
          <button class="btn danger" data-go="reject:${r.id}">Reject</button></div>
      </div></div></li>`;
}

function recent(rows) {
  if (!rows.length) return "";
  const outcome = d => (d.state === "approved" ? "published"
    : d.nowWith ? `now with ${d.nowWith}` : d.state);
  return `<section class="panel recent" style="margin-top:22px">
    <h3>Your recent decisions</h3>
    <ul class="list" style="margin-top:8px">${rows.map(d => `<li class="small row"
      style="justify-content:space-between" data-decided="${esc(d.eventTitle)}">
      <span><span class="h-icon ${esc(d.decision)}">${ICON[d.decision] || "·"}</span>
        <b>${esc(d.eventTitle)}</b> <span class="muted">(${esc(d.club)})</span></span>
      <span class="muted">${esc(d.decision === "approve" ? "Approved"
        : d.decision === "return" ? "Returned" : "Rejected")} — ${esc(outcome(d))}</span>
      </li>`).join("")}</ul></section>`;
}

/**
 * Render the queue for one gate. `intro` is HTML the page supplies; `emptyHint`
 * explains where proposals come from, because an empty queue is usually the chain
 * working and not a bug.
 */
export async function approvalQueuePage({ file, stage, heading, intro, emptyHint }) {
  await page(file, async (main, session, caps) => {
    const queue = api.governance.queue(session);
    if (!queue.stagesYouHold.includes(stage)) {
      throw Object.assign(new Error(`This queue belongs to ${STAGE_WITH[stage]}. `
        + `You hold: ${queue.stagesYouHold.map(s => STAGE_LABELS[s]).join(", ")
          || "no gate"}.`),
        { status: 403, title: "Not your gate", code: "GOVERNANCE_NOT_APPROVER" });
    }

    const draw = () => {
      const rows = api.governance.queue(session).results
        .filter(r => r.currentStage === stage);
      main.innerHTML = `
        <div class="head"><div><h1>${esc(heading)}</h1>
          <p class="muted">${intro}</p></div>
          <span class="pill ${rows.length ? "warn" : "ok"} queue-count">${rows.length}
            waiting</span></div>
        ${rows.length ? `<ul class="list approvals">${rows.map(r =>
          card(r, { isDean: caps.isDean })).join("")}</ul>`
          : `<div class="empty">All caught up at this gate. ${esc(emptyHint || "")}</div>`}
        ${recent(api.governance.myDecisions(session))}`;
      for (const r of rows) updateTotal(r.id);
    };

    const updateTotal = id => {
      const cell = main.querySelector(`[data-total="${id}"]`);
      if (!cell) return;
      const sum = [...main.querySelectorAll(`[data-sanc^="${id}:"]`)]
        .reduce((a, input) => a + (Number(input.value) || 0), 0);
      cell.textContent = inr(sum);
    };

    draw();

    main.addEventListener("input", event => {
      const input = event.target.closest("[data-sanc]");
      if (input) updateTotal(input.dataset.sanc.split(":")[0]);
    });

    main.addEventListener("click", event => {
      const button = event.target.closest("[data-go]");
      if (!button) return;
      const [decision, id] = button.dataset.go.split(":");
      const msg = document.getElementById(`m-${id}`);
      msg.innerHTML = "";
      const sanctioned = {};
      for (const input of main.querySelectorAll(`[data-sanc^="${id}:"]`)) {
        sanctioned[input.dataset.sanc.split(":")[1]] = input.value;
      }
      try {
        const result = api.governance.decide(session, id, {
          decision, comment: document.getElementById(`c-${id}`).value, sanctioned,
        });
        const r = result.request;
        toast(r.state === "approved" ? `Approved — “${r.eventTitle}” is published and `
            + "registration is open"
          : r.state === "pending" ? `Approved — “${r.eventTitle}” is now with ${
              STAGE_WITH[r.currentStage]}`
          : r.state === "returned" ? `Returned to ${r.club} with your comment`
          : `Rejected — ${r.club} has been told why`);
        draw();
      } catch (err) { showError(msg, err); }
    });
  });
}
