import json
import urllib.request
from functools import lru_cache

import jwt
from django.conf import settings

from integrations.base import Claims, IdentityProvider


class InvalidCredential(Exception):
    """Raised for any unusable token; the caller turns it into a 401."""


def _claims_from_payload(payload) -> Claims:
    """
    One reader for both modes.

    §5.2: switching to platform mode changes only where the token comes from
    and which key validates it. This function is what "nothing downstream of
    claim-reading changes" means in practice — it is shared by both providers.
    """
    missing = [k for k in ("sub", "email", "roles") if k not in payload]
    if missing:
        raise InvalidCredential(f"token missing required claims: {', '.join(missing)}")
    aud = payload.get("aud") or ()
    return Claims(
        sub=str(payload["sub"]),
        email=payload["email"],
        student_id=payload.get("student_id"),
        prn=payload.get("prn"),
        display_name=payload.get("display_name") or "",
        roles=tuple(payload.get("roles") or ()),
        department=payload.get("department"),
        programme=payload.get("programme"),
        year=payload.get("year"),
        mfa=bool(payload.get("mfa", False)),
        iss=payload.get("iss", ""),
        aud=tuple([aud] if isinstance(aud, str) else aud),
        extra={"scan_event": payload.get("scan_event"), "exp": payload.get("exp")},
    )


class LocalIdentityProvider(IdentityProvider):
    """
    Standalone mode: the module authenticates against its own user table and
    signs its own tokens, with the identical claim structure (§5.2).
    """

    algorithm = "HS256"

    def authenticate(self, raw_token):
        try:
            payload = jwt.decode(
                raw_token,
                settings.SECRET_KEY,
                algorithms=[self.algorithm],
                audience=settings.PLATFORM_AUDIENCE,
                options={"require": ["exp", "sub"]},
            )
        except jwt.ExpiredSignatureError as exc:
            raise InvalidCredential("token expired") from exc
        except jwt.InvalidTokenError as exc:
            raise InvalidCredential(str(exc)) from exc
        if payload.get("typ") != "access":
            raise InvalidCredential("not an access token")
        return _claims_from_payload(payload)


class PlatformIdentityProvider(IdentityProvider):
    """
    Platform mode: validate the platform's signature against its JWKS (§5.1
    step 7). No user lookup happens here — the claims carry basic identity so
    rendering a page costs no call back to the platform (§5.1 step 8).
    """

    def __init__(self, jwks_url=None, issuer=None, audience=None):
        self.jwks_url = jwks_url or settings.PLATFORM_JWKS_URL
        self.issuer = issuer or settings.PLATFORM_ISSUER
        self.audience = audience or settings.PLATFORM_AUDIENCE

    @staticmethod
    @lru_cache(maxsize=4)
    def _jwks(url):
        with urllib.request.urlopen(url, timeout=5) as resp:
            return json.loads(resp.read())

    def _key_for(self, raw_token):
        header = jwt.get_unverified_header(raw_token)
        kid = header.get("kid")
        for key in self._jwks(self.jwks_url).get("keys", []):
            if key.get("kid") == kid:
                return jwt.PyJWK(key).key
        # Key rotation: drop the cache once and retry before giving up.
        self._jwks.cache_clear()
        for key in self._jwks(self.jwks_url).get("keys", []):
            if key.get("kid") == kid:
                return jwt.PyJWK(key).key
        raise InvalidCredential(f"no platform signing key for kid={kid}")

    def authenticate(self, raw_token):
        if not self.jwks_url:
            raise InvalidCredential("PLATFORM_JWKS_URL is not configured")
        try:
            payload = jwt.decode(
                raw_token,
                self._key_for(raw_token),
                algorithms=["RS256", "ES256"],
                audience=self.audience,
                issuer=self.issuer,
                options={"require": ["exp", "sub", "iss"]},
            )
        except jwt.ExpiredSignatureError as exc:
            raise InvalidCredential("token expired") from exc
        except jwt.InvalidTokenError as exc:
            raise InvalidCredential(str(exc)) from exc
        return _claims_from_payload(payload)
