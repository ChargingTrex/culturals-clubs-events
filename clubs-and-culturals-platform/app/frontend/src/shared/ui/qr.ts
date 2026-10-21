/** QR rendering, drawn locally from the token — no server round trip. */
import QRCode from 'qrcode';

export async function qrDataUrl(text: string, size = 160): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });
}
