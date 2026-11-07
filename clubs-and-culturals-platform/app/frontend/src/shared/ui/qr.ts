/** QR rendering, drawn locally from the token — no server round trip. */
import QRCode from 'qrcode';

/**
 * QR colours come from the global config (tokens.css: --qr-ink, --qr-paper).
 * The QR library draws an image, so it can't use CSS variables directly; read
 * them at draw time. Falls back to black on white when unavailable (tests, SSR)
 * or not a plain hex value, which is all the library accepts.
 */
function qrColour(name: '--qr-ink' | '--qr-paper', fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : fallback;
}

export async function qrDataUrl(text: string, size = 160): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: qrColour('--qr-ink', '#000000'), light: qrColour('--qr-paper', '#ffffff') },
  });
}
