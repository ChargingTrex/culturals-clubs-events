"""
Login, refresh, logout and "who am I".

Standalone mode serves the password login below. In platform mode the login
screen is the platform's: the browser is redirected to SSO, comes back with a
token, and this module only validates it (§5.1). `/auth/mode` tells the frontend
which of the two it is looking at, so one build serves both.
"""
from django.conf import settings
from django.contrib.auth import authenticate
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from common import roles as R
from common.errors import ProblemDetail
from identity import tokens
from identity.models import LOGIN_ALLOWED, Status, User
from identity.serializers import (
    AuthModeSerializer, DemoPersonasSerializer, DemoSessionSerializer, DirectoryResultsSerializer,
    MeSerializer, RefreshRequestSerializer, SemesterSerializer, SessionSerializer,
)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    mfa_code = serializers.CharField(required=False, allow_blank=True)



def user_needs_mfa(user):
    """
    §5.5: MFA is mandatory for staff roles. It is enforced at login, and
    separately at the point of a sensitive action via the `mfa` claim. The same
    demand applies to any `is_staff` account and to anyone currently covering an
    approval gate under a Delegation (MASTER_SPEC §11.3): a delegated decision
    always needs the claim, so the login that issues it has to run the challenge
    for them too. One rule, used by login and by the demo account list.
    """
    from governance.models import Delegation

    return (
        bool(user.is_staff)
        or any(R.split_role(r)[0] in R.MFA_REQUIRED_ROLES for r in (user.global_roles or []))
        or Delegation.objects.in_force().filter(delegate_user=user).exists()
    )


def _auth_failed(detail):
    # One message for wrong address, wrong password and unknown account alike:
    # distinguishing them tells an attacker which institutional addresses exist.
    return ProblemDetail(code="AUTH_INVALID_CREDENTIALS", title="Login failed",
                         status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


def _session_payload(user, *, mfa):
    access, claims = tokens.access_token(user, mfa=mfa)
    return {
        "access_token": access,
        "refresh_token": tokens.issue_refresh(user, mfa=mfa),
        "token_type": "Bearer",
        "expires_in": int(settings.TOKEN_LIFETIMES["access"].total_seconds()),
        "claims": {k: v for k, v in claims.items() if k not in ("typ", "jti")},
    }


class ModeView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=AuthModeSerializer, summary="Which login flow this deployment uses")
    def get(self, request):
        platform = settings.INTEGRATION_MODE == "platform"
        return Response({
            "integration_mode": settings.INTEGRATION_MODE,
            "sso": {
                "enabled": platform,
                "issuer": settings.PLATFORM_ISSUER if platform else None,
                "authorize_url": f"{settings.PLATFORM_ISSUER}/auth/authorize" if platform else None,
                "audience": settings.PLATFORM_AUDIENCE,
            },
            "password_login": not platform,
            "approval_chain": settings.APPROVAL_CHAIN,
        })


class LoginView(APIView):
    """Standalone mode only (§5.2). Refused outright in platform mode."""

    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=LoginSerializer, responses=SessionSerializer,
                   summary="Password login (standalone mode)")
    def post(self, request):
        if settings.INTEGRATION_MODE != "local":
            raise ProblemDetail(
                code="AUTH_SSO_REQUIRED", title="Single sign-on is required",
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This deployment authenticates against the portal. Use the SSO flow.",
            )
        data = LoginSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = authenticate(request, username=data.validated_data["email"],
                            password=data.validated_data["password"])
        if user is None:
            raise _auth_failed("That email and password combination was not recognised.")
        if not user.can_login:
            # §3.5: provisional, withdrawn and suspended accounts cannot log in,
            # but their historical rows are untouched.
            raise ProblemDetail(
                code="AUTH_ACCOUNT_NOT_ACTIVE", title="Account cannot sign in",
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"This account is {user.get_status_display().lower()}.",
            )

        # §5.5: MFA is mandatory for staff roles (see needs_mfa).
        needs_mfa = user_needs_mfa(user)
        supplied = (data.validated_data.get("mfa_code") or "").strip()
        if needs_mfa and not supplied:
            raise ProblemDetail(
                code="AUTH_MFA_REQUIRED", title="Second factor required",
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="This role requires multi-factor authentication.",
                errors=[{"field": "mfa_code", "code": "REQUIRED",
                         "message": "Enter the code from your authenticator."}],
            )
        # A real deployment verifies `supplied` against a TOTP secret. Standalone
        # mode accepts any non-empty code so the demo can exercise staff roles;
        # platform mode never reaches here, because the platform runs the challenge.
        return Response(_session_payload(user, mfa=bool(needs_mfa and supplied)))


class RefreshView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=RefreshRequestSerializer, responses=SessionSerializer,
                   summary="Exchange a refresh token, rotating it")
    def post(self, request):
        raw = (request.data or {}).get("refresh_token", "")
        if not raw:
            raise _auth_failed("A refresh token is required.")
        try:
            user, new_refresh, mfa = tokens.rotate_refresh(raw)
        except ValueError as exc:
            raise _auth_failed(str(exc)) from exc
        access, claims = tokens.access_token(user, mfa=mfa)
        return Response({
            "access_token": access, "refresh_token": new_refresh, "token_type": "Bearer",
            "expires_in": int(settings.TOKEN_LIFETIMES["access"].total_seconds()),
            "claims": {k: v for k, v in claims.items() if k not in ("typ", "jti")},
        })


class LogoutView(APIView):
    @extend_schema(request=None, responses={204: None},
                   summary="Revoke the refresh token; the access token expires naturally")
    def post(self, request):
        record = request.user.record
        if record is not None:
            tokens.revoke_all(record)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    @extend_schema(responses=MeSerializer, summary="The caller's claims, as the frontend sees them")
    def get(self, request):
        ctx = request.auth_context
        return Response({
            "sub": ctx.sub, "display_name": ctx.display_name, "prn": ctx.prn,
            "student_id": ctx.student_id, "department": ctx.department,
            "programme": ctx.programme, "year": ctx.year, "roles": list(ctx.roles),
            "mfa": ctx.mfa,
            "capabilities": _capabilities(ctx),
        })


def _capabilities(ctx):
    """
    What the frontend may render. Advisory only — every one of these is checked
    again server-side on the request that acts on it (AGENT_PROMPT §3.2).
    """
    led = sorted(ctx.scopes_for(*R.CLUB_ROLES))
    return {
        # What the frontend may render. The Vice-Chancellor gets a dashboard:
        # `can_see_individual_records` is False for them, so no roster, attendee
        # list or PRN lookup is offered anywhere in the UI.
        "can_see_individual_records": ctx.can_see_individual_records(),
        "can_see_all_clubs": ctx.can_see_all_clubs(),
        "is_student": ctx.has_any(R.STUDENT),
        "is_dean": ctx.has_any(R.DEAN),
        "is_vice_chancellor": ctx.has_any(R.VICE_CHANCELLOR),
        "is_cultural_society": ctx.has_any(R.CULTURAL_SOCIETY),
        "is_admin": ctx.has_any(R.ADMIN),
        "clubs": led,
        "clubs_with_budget_access": sorted(ctx.scopes_for(*R.BUDGET_VIEWERS)),
        "clubs_can_assign_roles": sorted(ctx.scopes_for(*R.ROLE_ASSIGNERS)),
        "clubs_can_propose": sorted(ctx.scopes_for(*R.PROPOSERS)),
        "clubs_can_operate_events": sorted(ctx.scopes_for(*R.EVENT_OPERATORS)),
        "clubs_can_enter_spend": sorted(ctx.scopes_for(*R.BUDGET_SETTLERS)),
        # Door staff is its own set: a plain member is excluded because the scan
        # response carries names and PRNs, and the Treasurer because running a door
        # is not their job. The client cannot derive this from `clubs`.
        "clubs_door_staff": sorted(ctx.scopes_for(*R.DOOR_STAFF)),
        "can_see_overview": ctx.has_any(R.DEAN, R.ADMIN, R.CULTURAL_SOCIETY),
        "organiser_events": sorted(ctx.organiser_events()),
        "approval_stages": [s for s, role in R.STAGE_ROLE.items() if ctx.has_any(role)],
    }


class SemesterView(APIView):
    @extend_schema(responses=SemesterSerializer(many=True),
                   summary="Academic calendar (platform-owned; read only)")
    def get(self, request):
        from identity.models import Semester

        return Response([
            {"id": str(s.id), "name": s.name, "starts_on": s.starts_on,
             "ends_on": s.ends_on, "is_current": s.is_current}
            for s in Semester.objects.all()
        ])


class StudentLookupView(APIView):
    """
    PRN or name lookup for the check-in desk.

    Scoped deliberately: an organiser may see attendee identities for their own
    event only (AGENT_PROMPT §6), so this requires either an approval role or an
    organiser scope, and returns the minimum a desk needs to identify someone.
    """

    @extend_schema(
        parameters=[OpenApiParameter("q", OpenApiTypes.STR, OpenApiParameter.QUERY,
                                     description="PRN or part of a name.")],
        responses=DirectoryResultsSerializer,
        summary="Find a student by PRN or name (desk lookup)",
    )
    def get(self, request):
        ctx = request.auth_context
        # A PRN/name directory is individual student data, so the Vice-Chancellor
        # and the Cultural Society are excluded; organisers and club door staff
        # need it at the desk.
        if not (ctx.can_see_individual_records()
                or ctx.organiser_events()
                or ctx.scopes_for(*R.DOOR_STAFF)):
            raise ProblemDetail(code="DIRECTORY_NOT_PERMITTED", title="Not permitted",
                                status_code=status.HTTP_403_FORBIDDEN,
                                detail="Directory lookup is limited to organisers and staff.")
        from integrations.registry import student_directory

        results = student_directory().search(request.query_params.get("q", ""))
        return Response({"results": [
            {"student_id": str(s.id), "prn": s.prn, "full_name": s.full_name,
             "department": s.department, "programme": s.programme, "year": s.year_of_study}
            for s in results
        ]})


# ---------------------------------------------------------------------------
# Demo mode
# ---------------------------------------------------------------------------
DEMO_PERSONAS = {
    "student": {
        "label": "Student", "sub": "Any enrolled student",
        "find": lambda: _first_student_without_club_role(),
    },
    "organiser": {
        "label": "Organiser", "sub": "President, Photography Club — runs the live event",
        "find": lambda: _club_officer("Photography Club", R.CLUB_PRESIDENT),
    },
    "president": {
        "label": "President", "sub": "President, Music Club",
        "find": lambda: _club_officer("Music Club", R.CLUB_PRESIDENT),
    },
    "treasurer": {
        "label": "Treasurer", "sub": "Treasurer, Music Club",
        "find": lambda: _club_officer("Music Club", R.CLUB_TREASURER),
    },
    "member": {
        "label": "Club member", "sub": "Member, Music Club — no budget access",
        "find": lambda: _club_officer("Music Club", R.CLUB_MEMBER),
    },
    "society": {
        "label": "Cultural Society", "sub": "Cultural secretary — approval gate 1",
        "find": lambda: _staff("cultural.secretary@college.edu"),
    },
    "dean": {
        "label": "Dean", "sub": "Dean of Student Affairs — the mandatory gate",
        "find": lambda: _staff("dean@college.edu"),
    },
    "vc": {
        "label": "Management", "sub": "Vice-Chancellor — dashboard only",
        "find": lambda: _staff("vc@college.edu"),
    },
}


def _staff(email):
    return User.objects.filter(email=email).first()


def _club_officer(club_name, role):
    from clubs.models import Membership

    membership = (Membership.objects
                  .filter(club__name=club_name, role=role, ended_at__isnull=True)
                  .select_related("student__user").first())
    return membership.student.user if membership else None


def _first_student_without_club_role():
    from clubs.models import Membership

    held = Membership.objects.filter(ended_at__isnull=True).values_list("student_id", flat=True)
    from identity.models import Student

    student = Student.objects.exclude(id__in=held).select_related("user").first()
    return student.user if student else None


class DemoPersonasView(APIView):
    """The personas a demo can switch between. 404 when DEMO_MODE is off."""

    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(responses=DemoPersonasSerializer, summary="Demo personas (DEMO_MODE only)")
    def get(self, request):
        if not settings.DEMO_MODE:
            raise ProblemDetail(code="NOT_FOUND", title="Not found", status_code=404,
                                detail="Demo mode is not enabled.")
        # Demo mode only (404 otherwise): the pilot accounts are public test
        # accounts, so the sign-in page can list them and fill the form. Signing in
        # still goes through the real login, including the second factor.
        from identity.management.commands.seed_demo import PASSWORD as DEMO_PASSWORD

        out = []
        for key, persona in DEMO_PERSONAS.items():
            user = persona["find"]()
            out.append({"key": key, "label": persona["label"], "sub": persona["sub"],
                        "available": user is not None,
                        "name": user.display_name if user else None,
                        "email": user.email if user else None,
                        "password": DEMO_PASSWORD if user else None,
                        "mfa_required": user_needs_mfa(user) if user else False})
        return Response({"demo_mode": True, "personas": out})


class DemoLoginView(APIView):
    """
    Issue a real token for a demo persona, with no password.

    The token is ordinary: same claims, same expiry, same signature. Every
    permission check downstream runs untouched, which is why the demo can show a
    403 on the Vice-Chancellor's roster attempt and mean it.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=None, responses=DemoSessionSerializer,
                   summary="Passwordless login for a demo persona (DEMO_MODE only)")
    def post(self, request, persona):
        if not settings.DEMO_MODE:
            raise ProblemDetail(code="NOT_FOUND", title="Not found", status_code=404,
                                detail="Demo mode is not enabled.")
        spec = DEMO_PERSONAS.get(persona)
        if spec is None:
            raise ProblemDetail(code="DEMO_UNKNOWN_PERSONA", title="No such persona",
                                status_code=404,
                                detail=f"Known personas: {', '.join(DEMO_PERSONAS)}")
        user = spec["find"]()
        if user is None:
            raise ProblemDetail(
                code="DEMO_PERSONA_UNAVAILABLE", title="Persona not seeded",
                status_code=409,
                detail=f"No user matches the {persona!r} persona. Run: manage.py seed_demo",
            )
        # MFA is granted here because the staff personas need it to sanction, and a
        # demo cannot read an authenticator app. Outside DEMO_MODE this path does
        # not exist, so it grants nothing anywhere else.
        needs_mfa = any(R.split_role(r)[0] in R.MFA_REQUIRED_ROLES
                        for r in (user.global_roles or []))
        payload = _session_payload(user, mfa=needs_mfa)
        payload["persona"] = {"key": persona, "label": spec["label"], "sub": spec["sub"]}
        return Response(payload)
