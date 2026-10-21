"""
Local token issuing.

The claim structure is identical to platform mode from day one
(Identity_Login_Shared_Data §5.2 and §5.4). If standalone tokens carried a
different shape, every piece of code that reads them would be rewritten at
integration; identical claims make integration a configuration change.
"""
import hashlib
import secrets
import uuid
from datetime import timedelta

import jwt
from django.conf import settings
from django.utils import timezone

from common import roles as R
from identity.models import RefreshToken

ALGORITHM = "HS256"


def hash_refresh(raw):
    return hashlib.sha256(raw.encode()).hexdigest()


def roles_for(user):
    """
    Assemble the `roles` claim: global roles from the user row, plus one scoped
    role per active club membership, so "President of Swara" travels in the
    token and needs no lookup on render (§5.1 step 8).
    """
    from clubs.models import Membership

    out = list(user.global_roles or [])
    if user.student and R.STUDENT not in out:
        out.append(R.STUDENT)
    if user.student:
        memberships = Membership.objects.filter(
            student=user.student, ended_at__isnull=True
        ).values_list("role", "club_id")
        out += [R.scoped(role, str(club_id)) for role, club_id in memberships]
    return sorted(set(out))


def _base_claims(user, *, mfa, audience=None):
    student = user.student
    return {
        "sub": str(user.id),
        "iss": settings.PLATFORM_ISSUER,
        "aud": audience or settings.PLATFORM_AUDIENCE,
        "email": user.email,
        "student_id": str(student.id) if student else None,
        "prn": student.prn if student else None,
        "display_name": user.display_name,
        "roles": roles_for(user),
        "department": student.department if student else None,
        "programme": student.programme if student else None,
        "year": student.year_of_study if student else None,
        "mfa": bool(mfa),
    }


def _sign(payload):
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=ALGORITHM)


def access_token(user, *, mfa=False, lifetime=None, scan_event_id=None):
    now = timezone.now()
    ttl = lifetime or settings.TOKEN_LIFETIMES["access"]
    payload = _base_claims(user, mfa=mfa)
    payload |= {"typ": "access", "iat": int(now.timestamp()),
                "exp": int((now + ttl).timestamp()), "jti": uuid.uuid4().hex}
    if scan_event_id:
        # §5.3: the scan-station session is bound to one event and expires with
        # it. An organiser cannot re-authenticate mid-queue, and a station that
        # logs out during an event gets abandoned for a paper list.
        payload["scan_event"] = str(scan_event_id)
    return _sign(payload), payload


def scan_station_token(user, event):
    """Event duration + 4 hours, capped at the event (§5.3)."""
    grace = settings.TOKEN_LIFETIMES["scan_station_grace"]
    ttl = max(event.ends_at + grace - timezone.now(), timedelta(minutes=5))
    return access_token(user, mfa=False, lifetime=ttl, scan_event_id=event.id)


def issue_refresh(user, *, mfa=False, family=None):
    raw = secrets.token_urlsafe(48)
    # §5.3: staff and admin sessions have a shorter absolute cap regardless of
    # activity, so the refresh window itself is capped, not just the access token.
    is_staff_role = any(
        R.split_role(r)[0] in (R.DEAN, R.VICE_CHANCELLOR, R.ADMIN, R.CULTURAL_SOCIETY)
        for r in (user.global_roles or [])
    )
    ttl = settings.TOKEN_LIFETIMES["staff_session_cap" if is_staff_role else "refresh"]
    RefreshToken.objects.create(
        user=user, token_hash=hash_refresh(raw), expires_at=timezone.now() + ttl,
        family=family or uuid.uuid4(), mfa=mfa,
    )
    return raw


def rotate_refresh(raw):
    """
    Rotate on use; reuse of a consumed token revokes the family (§5.3).

    Returns (user, new_raw, mfa). Raises ValueError for anything unusable — the
    view turns that into a 401 without saying which of the several reasons it was.
    """
    record = RefreshToken.objects.filter(token_hash=hash_refresh(raw)).select_related("user").first()
    if record is None:
        raise ValueError("unknown refresh token")
    now = timezone.now()
    if record.consumed_at is not None:
        # Replay. The legitimate holder also has a token in this family, so the
        # only safe response is to revoke all of them and force a fresh login.
        RefreshToken.objects.filter(family=record.family, revoked_at__isnull=True).update(revoked_at=now)
        raise ValueError("refresh token reuse detected; family revoked")
    if record.revoked_at is not None or record.expires_at <= now:
        raise ValueError("refresh token expired or revoked")
    if not record.user.can_login:
        raise ValueError("account may not log in")
    record.consumed_at = now
    record.save(update_fields=["consumed_at", "updated_at"])
    return record.user, issue_refresh(record.user, mfa=record.mfa, family=record.family), record.mfa


def revoke_all(user):
    """
    §5.6: a status change to suspended or withdrawn revokes every active session
    in both systems, without waiting for the access token to expire.
    """
    return RefreshToken.objects.filter(user=user, revoked_at__isnull=True).update(
        revoked_at=timezone.now()
    )
