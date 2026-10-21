"""
QR generation, done locally.

Both source projects call the external goqr.me / qrserver.com API to render
codes. That is convenient and wrong for this system, for three reasons:

  1. Privacy. Every generated code sends the token — which identifies a
     student — to a third party outside the institution. For a system holding
     participation records under DPDP, that is an unnecessary disclosure to a
     processor nobody has assessed.
  2. Availability. If the API is slow or down, no passes are issued. Issuing
     passes is on the critical path of an event opening registration.
  3. Bulk. Generating 2,000 fest passes means 2,000 outbound HTTP calls,
     which is slow and will be rate limited.

Local generation removes all three. The dependency is `qrcode[pil]`, which is
BSD-licensed and has no network calls.
"""

from __future__ import annotations

import base64
import io

import qrcode
from qrcode.constants import ERROR_CORRECT_M, ERROR_CORRECT_Q
from qrcode.image.pil import PilImage


def make_qr_png(
    data: str,
    *,
    box_size: int = 10,
    border: int = 4,
    high_resilience: bool = False,
) -> bytes:
    """
    Render `data` as a PNG.

    high_resilience raises error correction from M (~15% recoverable) to
    Q (~25%). Use it for anything printed — a badge that picks up a thumbprint
    or a crease still scans. Screen-displayed codes do not need it, and the
    lower correction level keeps the code less dense and therefore easier for
    a cheap camera to read in poor light.
    """
    qr = qrcode.QRCode(
        version=None,                      # auto-size to the data
        error_correction=ERROR_CORRECT_Q if high_resilience else ERROR_CORRECT_M,
        box_size=box_size,
        border=border,                     # 4 modules is the spec minimum; less breaks scanning
    )
    qr.add_data(data)
    qr.make(fit=True)

    img: PilImage = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return buffer.getvalue()


def make_qr_data_uri(data: str, **kwargs) -> str:
    """
    Inline data URI, for embedding in an email or a page without a second
    request. Keeps emailed passes working when a mail client blocks remote
    images — which most do by default, and which silently broke the emailed
    QR in the original bulk-mail flow.
    """
    png = make_qr_png(data, **kwargs)
    return "data:image/png;base64," + base64.b64encode(png).decode("ascii")


def profile_qr_data_uri(token: str) -> str:
    """Student profile QR, rendered for on-screen display."""
    return make_qr_data_uri(token, box_size=12, border=4)


def event_pass_qr_data_uri(token: str) -> str:
    """Event pass, likely to be printed or screenshotted — use high resilience."""
    return make_qr_data_uri(token, box_size=10, border=4, high_resilience=True)


def certificate_qr_data_uri(verify_url: str) -> str:
    """
    Certificate QR encodes a full verification URL, not a bare token, so that
    a recruiter scanning it with a stock phone camera lands on the portal
    without needing the institution's app.
    """
    return make_qr_data_uri(verify_url, box_size=8, border=4, high_resilience=True)
