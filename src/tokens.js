/**
 * Signed QR tokens — HMAC-SHA256 via Web Crypto.
 *
 * Carries over the three fixes from the backend's qrkit:
 *   - purpose binding, so a profile code is not structurally a valid pass
 *   - event binding, so a pass presented elsewhere is a detectable wrong_event
 *   - the subject of a pass is the PASS row, not the registration: the pass row is
 *     what carries used_at, so the token names exactly the thing that gets spent
 *
 * HONEST LIMIT: in a browser-only build the signing key ships to the client, so a
 * determined tester can mint a valid code. The signature is here to keep the data
 * STRUCTURE honest — purposes, event binding, single use — not to secure anything.
 * Real signing happens server-side; see the Django backend.
 */
const KEY_ID = "demo";
const SECRET = "culturals-demo-signing-key-not-a-secret";

export const PURPOSE_PASS = "pass";
export const PURPOSE_PROFILE = "profile";

export class TokenInvalid extends Error {}
export class TokenExpired extends Error {}
export class TokenWrongPurpose extends Error {}

const subtle = globalThis.crypto?.subtle;
if (!subtle) {
  throw new Error("Web Crypto unavailable — needs a modern browser or Node 18+.");
}

const enc = new TextEncoder();
let keyPromise = null;
function signingKey() {
  if (!keyPromise) {
    keyPromise = subtle.importKey(
      "raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
    );
  }
  return keyPromise;
}

const b64e = bytes => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64d = text => {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - (text.length % 4)) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
};

async function sign(payload) {
  const mac = await subtle.sign("HMAC", await signingKey(), enc.encode(`${KEY_ID}.${payload}`));
  return b64e(new Uint8Array(mac));
}

/**
 * A per-token nonce.
 *
 * `iat` is whole seconds, so two tokens minted in the same second had identical
 * payloads and therefore identical signatures — which meant reissuing a profile QR
 * returned the SAME string and silently failed to invalidate the lost one. The
 * nonce makes every issued token distinct.
 */
let nonce = 0;

export async function issue(purpose, subject, { eventId = null, ttlSeconds = null } = {}) {
  nonce += 1;
  const body = {
    p: purpose, s: String(subject), iat: Math.floor(Date.now() / 1000), n: nonce,
  };
  if (eventId) body.e = String(eventId);
  if (ttlSeconds) body.exp = body.iat + ttlSeconds;
  const payload = b64e(enc.encode(JSON.stringify(body)));
  return `${KEY_ID}.${payload}.${await sign(payload)}`;
}

export async function verify(token, { expectPurpose = null } = {}) {
  const parts = String(token || "").trim().split(".");
  if (parts.length !== 3) throw new TokenInvalid("malformed token");
  const [kid, payload, signature] = parts;
  if (kid !== KEY_ID) throw new TokenInvalid("unknown key id");

  const expected = await sign(payload);
  // Constant-time-ish compare. A plain === leaks how many leading bytes matched.
  if (expected.length !== signature.length) throw new TokenInvalid("bad signature");
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  if (diff !== 0) throw new TokenInvalid("bad signature");

  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(b64d(payload)));
  } catch {
    throw new TokenInvalid("unreadable payload");
  }
  if (body.exp && body.exp < Math.floor(Date.now() / 1000)) {
    throw new TokenExpired("expired");
  }
  if (expectPurpose && body.p !== expectPurpose) {
    throw new TokenWrongPurpose(`token is for ${body.p}, expected ${expectPurpose}`);
  }
  return { purpose: body.p, subject: body.s, eventId: body.e || null, issuedAt: body.iat };
}

export const issueProfileToken = studentId => issue(PURPOSE_PROFILE, studentId);
export const issueEventPass = (passId, eventId) =>
  issue(PURPOSE_PASS, passId, { eventId, ttlSeconds: 60 * 60 * 24 * 60 });
