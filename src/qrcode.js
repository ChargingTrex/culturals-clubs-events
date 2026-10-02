/**
 * QR rendering and camera scanning.
 *
 * Both libraries load from a CDN on first use and are optional: if either fails —
 * offline, blocked, a locked-down network — the page falls back to showing the
 * token as text, which still demonstrates the workflow because the scan station
 * accepts a pasted code. A walkthrough that dies because a CDN is unreachable
 * teaches nothing.
 */
const QR_LIB = "https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js";
const SCANNER_LIB = "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js";

const loaded = new Map();

function loadScript(src) {
  if (loaded.has(src)) return loaded.get(src);
  const promise = new Promise((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve(true);
    el.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.appendChild(el);
  }).catch(() => false);
  loaded.set(src, promise);
  return promise;
}

/** A data: URL for a QR image, or null when the library is unavailable. */
async function toDataUrl(text, size = 160) {
  if (typeof document === "undefined") return null;
  const ok = await loadScript(QR_LIB);
  if (!ok || !globalThis.QRCode) return null;
  try {
    return await globalThis.QRCode.toDataURL(String(text), {
      width: size, margin: 1,
      // High error correction: these get scanned off a phone screen in a dark hall.
      errorCorrectionLevel: "M",
      color: { dark: "#1a1a1aff", light: "#ffffffff" },
    });
  } catch {
    return null;
  }
}

/**
 * Start the camera scanner, calling `onCode` for each distinct code seen.
 * Returns a stop function, or null if the camera or the library is unavailable.
 */
async function startCamera(elementId, onCode) {
  const ok = await loadScript(SCANNER_LIB);
  if (!ok || !globalThis.Html5Qrcode) return null;
  try {
    const scanner = new globalThis.Html5Qrcode(elementId);
    let last = "";
    await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 220 },
      text => {
        // The camera fires continuously while a code is in frame; debounce so one
        // presentation is one scan.
        if (text === last) return;
        last = text;
        setTimeout(() => { last = ""; }, 2500);
        onCode(text);
      });
    return async () => { try { await scanner.stop(); } catch {} };
  } catch {
    return null;
  }
}

export default { toDataUrl, startCamera };
