/**
 * Sign-in for the pilot.
 *
 * Deliberately the same shape as the production backend's login: the same error
 * codes, the same mandatory second factor for staff roles, and a session carrying
 * the identical claims. Identity_Login_Shared_Data §5.2 is explicit that switching
 * from the module's own user table to portal SSO must change only where the token
 * comes from — so the login screen, the codes and the claims are built to survive
 * that switch unchanged.
 *
 * HONEST LIMIT: the password hashes and the whole user table live in this browser,
 * and the credentials are published in DEMO_CREDENTIALS.md. Hashing here buys no
 * secrecy — it is here so the STRUCTURE is right (no plaintext password in the
 * state document, a per-account salt, a verify step that can fail) and so that
 * pointing this at a real server is a change to one module. Nothing here defends
 * anything.
 */
import { db, save, store } from "./db.js";
import { Problem } from "./errors.js";
import * as R from "./roles.js";
import { Session, savePersona } from "./session.js";

const SESSION_KEY = "culturals.session";

/**
 * The demo accounts, one per role.
 *
 * Fixed addresses rather than the PRN-derived ones the seed generates: a tester
 * reads these from a sheet, and a login that changed every time the dataset was
 * reseeded would be useless on a feedback day.
 */
export const DEMO_ACCOUNTS = [
  { persona: "student", email: "student@demo.college.edu", password: "student-2026",
    label: "Student", note: "No club role at all — the plainest view" },
  { persona: "member", email: "member@demo.college.edu", password: "member-2026",
    label: "Club member", note: "Swara. Club internals, never the budget" },
  { persona: "secretary", email: "secretary@demo.college.edu", password: "secretary-2026",
    label: "Secretary", note: "Swara. Raises proposals, runs events, works the door" },
  { persona: "treasurer", email: "treasurer@demo.college.edu", password: "treasurer-2026",
    label: "Treasurer", note: "Swara. Builds the budget, records spend, settles" },
  { persona: "president", email: "president@demo.college.edu", password: "president-2026",
    label: "President", note: "Swara. All the club's work, plus assigning roles" },
  { persona: "organiser", email: "organiser@demo.college.edu", password: "organiser-2026",
    label: "Organiser", note: "Lens. Runs the live event and its scan station" },
  { persona: "society", email: "society@demo.college.edu", password: "society-2026",
    label: "Cultural Society", note: "Approval gate 1", mfa: true },
  { persona: "dean", email: "dean@demo.college.edu", password: "dean-2026",
    label: "Dean of Student Affairs", note: "Gate 2 — the mandatory one", mfa: true },
  { persona: "vc", email: "management@demo.college.edu", password: "management-2026",
    label: "Management", note: "Gate 3 for large budgets. Aggregates only", mfa: true },
];

/**
 * The second factor for staff accounts.
 *
 * Identity_Login_Shared_Data §5.5 makes MFA mandatory for the Dean, Management, the
 * Cultural Society and admins. A walkthrough cannot read an authenticator app, so
 * the pilot accepts any non-empty code — exactly as the backend's demo mode does —
 * and documents this one. The gate still demonstrates itself: staff cannot sign in
 * without entering something.
 */
export const DEMO_MFA_CODE = "123456";

// --- hashing --------------------------------------------------------------
//
// A single salted SHA-256, not PBKDF2.
//
// Iteration counts exist to make offline cracking expensive. These passwords are
// published in DEMO_CREDENTIALS.md, so there is nothing to crack and stretching
// them buys literally nothing — while costing every tester a delay on first load
// and, in headless Chrome, never settling at all. What a hash still earns here is
// structural: no plaintext password sits in the state document, each account has
// its own salt, and verifying is a step that can fail.
//
// A real deployment does not do this. It does not store passwords at all: people
// sign in through the portal's single sign-on and this module only reads claims.
const subtle = globalThis.crypto?.subtle;
const enc = new TextEncoder();

const toHex = buffer => [...new Uint8Array(buffer)]
  .map(b => b.toString(16).padStart(2, "0")).join("");

/** A small synchronous digest, for when Web Crypto is unavailable. */
function fallbackDigest(text) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `fb:${((4294967296 * (2097151 & h2)) + (h1 >>> 0)).toString(36)}`;
}

async function derive(password, salt) {
  if (!subtle) return fallbackDigest(`${salt}:${password}`);
  try {
    return toHex(await subtle.digest("SHA-256", enc.encode(`${salt}:${password}`)));
  } catch {
    return fallbackDigest(`${salt}:${password}`);
  }
}

function randomSalt() {
  if (globalThis.crypto?.getRandomValues) {
    return toHex(globalThis.crypto.getRandomValues(new Uint8Array(8)));
  }
  return Math.random().toString(36).slice(2, 18);
}

// --- installing onto the seeded users ------------------------------------
/**
 * Attach a demo login to the user each persona resolves to.
 *
 * Called at the end of bootstrap, once memberships exist — the personas are
 * defined by club role, so "whoever is Swara's Treasurer" is only answerable then.
 */
export async function installCredentials() {
  const { sessionFor } = await import("./session.js");
  const installed = [];
  for (const account of DEMO_ACCOUNTS) {
    const session = sessionFor(account.persona);
    if (!session) continue;
    const user = db().users.find(u => u.id === session.sub);
    if (!user) continue;
    const salt = randomSalt();
    user.loginEmail = account.email;
    user.passwordSalt = salt;
    user.passwordHash = await derive(account.password, salt);
    // The role decides whether a second factor is required, not the account.
    user.mfaRequired = (user.globalRoles || []).some(
      r => R.MFA_REQUIRED_ROLES.includes(r));
    user.personaKey = account.persona;
    user.status = user.status || "active";
    installed.push(account.email);
  }
  save();
  return installed;
}

// --- signing in ----------------------------------------------------------
const authFailed = () => new Problem({
  code: "AUTH_INVALID_CREDENTIALS", title: "Sign-in failed", status: 401,
  // One message for an unknown address and a wrong password alike: telling them
  // apart would confirm which addresses exist.
  detail: "That email and password combination was not recognised.",
});

/**
 * Verify an email and password, and start a session.
 *
 * Mirrors the backend's LoginView: AUTH_INVALID_CREDENTIALS, AUTH_MFA_REQUIRED and
 * AUTH_ACCOUNT_NOT_ACTIVE, in that order, so a client written against one works
 * against the other.
 */
export async function signIn({ email, password, mfaCode = "" }) {
  const address = String(email || "").trim().toLowerCase();
  const secret = String(password || "");
  if (!address || !secret) throw authFailed();

  const user = db().users.find(
    u => (u.loginEmail || "").toLowerCase() === address
      || (u.email || "").toLowerCase() === address);
  if (!user || !user.passwordHash) throw authFailed();

  const attempt = await derive(secret, user.passwordSalt || "");
  // Length-independent compare, for the same reason the QR tokens use one.
  if (attempt.length !== user.passwordHash.length) throw authFailed();
  let diff = 0;
  for (let i = 0; i < attempt.length; i += 1) {
    diff |= attempt.charCodeAt(i) ^ user.passwordHash.charCodeAt(i);
  }
  if (diff !== 0) throw authFailed();

  if (user.status && user.status !== "active") {
    // §3.5: a suspended or withdrawn account cannot sign in, but its historical
    // rows are untouched.
    throw new Problem({
      code: "AUTH_ACCOUNT_NOT_ACTIVE", title: "Account cannot sign in", status: 403,
      detail: `This account is ${user.status}.`,
    });
  }

  if (user.mfaRequired && !String(mfaCode).trim()) {
    throw new Problem({
      code: "AUTH_MFA_REQUIRED", title: "Second factor required", status: 401,
      detail: "This role requires a second factor. Enter the code from your "
        + "authenticator.",
      errors: [{ field: "mfaCode", code: "REQUIRED",
                 message: `For the pilot, use ${DEMO_MFA_CODE}.` }],
    });
  }

  const session = buildSession(user, Boolean(user.mfaRequired));
  persist(user, session.mfa);
  return session;
}

function buildSession(user, mfa) {
  const student = db().students.find(s => s.userId === user.id) || null;
  const session = new Session({
    personaKey: user.personaKey || "student", user, student,
  });
  // The claim records whether this session was verified, so a sensitive action can
  // demand it independently of the role.
  session.mfa = mfa;
  return session;
}

function persist(user, mfa) {
  try {
    store.setItem(SESSION_KEY, JSON.stringify({
      userId: user.id, personaKey: user.personaKey, mfa, at: Date.now(),
    }));
  } catch {
    // A private window still works for the length of the page.
  }
  // ui.js reads the persona key; keep it in step so one sign-out clears both.
  savePersona(user.personaKey || "student");
}

/** The signed-in session, or null. */
export function currentSession() {
  let stored = null;
  try { stored = JSON.parse(store.getItem(SESSION_KEY) || "null"); }
  catch { stored = null; }
  if (!stored || !stored.userId) return null;
  const user = db().users.find(u => u.id === stored.userId);
  if (!user) return null;
  return buildSession(user, Boolean(stored.mfa));
}

export function signOut() {
  try { store.removeItem(SESSION_KEY); } catch {}
  try { store.removeItem("culturals.persona"); } catch {}
}

/** Every demo account with the user it resolved to — for the sign-in page. */
export function demoAccountList() {
  return DEMO_ACCOUNTS.map(account => {
    const user = db().users.find(
      u => (u.loginEmail || "").toLowerCase() === account.email.toLowerCase());
    return {
      ...account,
      name: user ? user.displayName : null,
      mfaRequired: user ? Boolean(user.mfaRequired) : Boolean(account.mfa),
      available: Boolean(user),
    };
  });
}
