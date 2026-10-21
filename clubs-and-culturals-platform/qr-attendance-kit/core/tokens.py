"""
Signed token generation and verification.

Derived from the HMAC-SHA256 token approach in
ChargingTrex/qr-certificate-verification-system (MIT, (c) 2026 Arun Balaji S).
Reimplemented for Django with the following changes:

  * versioned key IDs so a compromised secret can be rotated without
    invalidating every certificate ever issued
  * explicit purpose binding, so a certificate token can never be replayed
    at a scan station and vice versa
  * optional expiry and event binding for attendance passes
  * constant-time comparison (the original used ==, which leaks timing)
  * URL-safe base64 without padding, so tokens survive QR encoding and
    copy-paste out of an email client
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Any

from django.conf import settings


class TokenError(Exception):
    """Base for all token failures."""


class TokenInvalid(TokenError):
    """Signature did not verify, or the payload was malformed."""


class TokenExpired(TokenError):
    """Token was well-formed and correctly signed, but has expired."""


class TokenWrongPurpose(TokenError):
    """Token is valid but was issued for a different use."""


# Purposes. A token is only ever accepted by the code path that matches.
PURPOSE_PROFILE = "profile"      # persistent student profile QR
PURPOSE_EVENT_PASS = "pass"      # one-time per-event pass
PURPOSE_CERTIFICATE = "cert"     # certificate verification


def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64d(value: str) -> bytes:
    pad = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + pad)


def _secret(key_id: str) -> bytes:
    """
    Resolve a key id to its secret.

    Keys live in settings.QR_SIGNING_KEYS, e.g.

        QR_SIGNING_KEYS = {"v2": os.environ["QR_KEY_V2"],
                           "v1": os.environ["QR_KEY_V1"]}
        QR_ACTIVE_KEY_ID = "v2"

    Old keys stay listed so previously issued tokens keep verifying after a
    rotation. Remove a key id only when you are willing to invalidate every
    token signed with it.
    """
    keys = getattr(settings, "QR_SIGNING_KEYS", {})
    secret = keys.get(key_id)
    if not secret:
        raise TokenInvalid(f"unknown key id: {key_id}")
    if len(secret) < 32:
        raise TokenError("signing key must be at least 32 bytes")
    return secret.encode("utf-8") if isinstance(secret, str) else secret


@dataclass(frozen=True)
class TokenPayload:
    purpose: str
    subject: str                 # student uuid, registration uuid, or cert id
    event_id: str | None = None  # binds a pass to one event
    issued_at: int = 0
    expires_at: int | None = None
    extra: dict[str, Any] | None = None


def issue(
    purpose: str,
    subject: str,
    *,
    event_id: str | None = None,
    ttl_seconds: int | None = None,
    extra: dict[str, Any] | None = None,
) -> str:
    """
    Produce a signed, URL-safe token.

    Format:  <key_id>.<payload_b64>.<signature_b64>

    The key id travels in clear text so verification knows which secret to
    use. That is not a leak: knowing which key signed something tells an
    attacker nothing useful about the key.
    """
    now = int(time.time())
    body: dict[str, Any] = {
        "p": purpose,
        "s": subject,
        "iat": now,
    }
    if event_id:
        body["e"] = event_id
    if ttl_seconds:
        body["exp"] = now + ttl_seconds
    if extra:
        body["x"] = extra

    key_id = getattr(settings, "QR_ACTIVE_KEY_ID", "v1")
    payload = _b64e(json.dumps(body, separators=(",", ":"), sort_keys=True).encode())
    signature = _b64e(hmac.new(_secret(key_id), payload.encode(), hashlib.sha256).digest())
    return f"{key_id}.{payload}.{signature}"


def verify(token: str, *, expect_purpose: str, expect_event: str | None = None) -> TokenPayload:
    """
    Verify a token and return its payload.

    Raises TokenInvalid, TokenExpired or TokenWrongPurpose. Callers should
    treat all three distinctly: at a scan station they map to different
    operator-facing messages.
    """
    if not token or token.count(".") != 2:
        raise TokenInvalid("malformed token")

    key_id, payload, signature = token.split(".")

    expected = _b64e(hmac.new(_secret(key_id), payload.encode(), hashlib.sha256).digest())
    # Constant-time: a plain == leaks how many leading bytes matched, which
    # is enough to forge a signature given enough attempts.
    if not hmac.compare_digest(expected, signature):
        raise TokenInvalid("signature mismatch")

    try:
        body = json.loads(_b64d(payload))
    except Exception as exc:  # noqa: BLE001 - any decode failure is the same to us
        raise TokenInvalid("undecodable payload") from exc

    purpose = body.get("p")
    if purpose != expect_purpose:
        raise TokenWrongPurpose(f"token is for {purpose!r}, expected {expect_purpose!r}")

    expires_at = body.get("exp")
    if expires_at and int(time.time()) > expires_at:
        raise TokenExpired("token expired")

    event_id = body.get("e")
    if expect_event is not None and event_id != expect_event:
        # Deliberately its own error: at the gate this is "wrong event",
        # which is a different operator action from "invalid code".
        raise TokenWrongPurpose("token issued for a different event")

    return TokenPayload(
        purpose=purpose,
        subject=body["s"],
        event_id=event_id,
        issued_at=body.get("iat", 0),
        expires_at=expires_at,
        extra=body.get("x"),
    )


def issue_profile_token(student_id: str) -> str:
    """Persistent profile QR. No expiry; revocation is by DB flag, not by exp."""
    return issue(PURPOSE_PROFILE, str(student_id))


def issue_event_pass(registration_id: str, event_id: str, ttl_seconds: int = 60 * 60 * 24 * 30) -> str:
    """One-time event pass. TTL is a backstop; single-use is enforced in the DB."""
    return issue(PURPOSE_EVENT_PASS, str(registration_id), event_id=str(event_id), ttl_seconds=ttl_seconds)


def issue_certificate_token(certificate_id: str, *, prn: str, event: str) -> str:
    """Certificate verification token. Never expires — a certificate is permanent."""
    return issue(PURPOSE_CERTIFICATE, str(certificate_id), extra={"prn": prn, "event": event})
