"""
One authentication class for both modes.

The view layer never learns which provider ran. §5.2: switching to platform mode
changes where the token comes from and which key validates it — nothing
downstream of claim-reading changes, and this class is that boundary.
"""
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from common import roles as R
from integrations.identity import InvalidCredential
from integrations.registry import identity_provider


class AuthContext:
    """
    What a view asks about the caller. Reads the claims, never the database,
    so a permission check costs no query.
    """

    def __init__(self, claims):
        self.claims = claims
        self.sub = claims.sub
        self.student_id = claims.student_id
        self.prn = claims.prn
        self.display_name = claims.display_name
        self.roles = tuple(claims.roles)
        self.mfa = claims.mfa
        self.department = claims.department
        self.programme = claims.programme
        self.year = claims.year
        self.scan_event = (claims.extra or {}).get("scan_event")
        self._parsed = tuple(R.split_role(r) for r in self.roles)

    def has_any(self, *names):
        """True if any role with one of these names is held, at any scope."""
        wanted = set(names)
        return any(name in wanted for name, _ in self._parsed)

    def scopes_for(self, *names):
        """Every scope id held under these role names, e.g. the clubs led."""
        wanted = set(names)
        return {scope for name, scope in self._parsed if name in wanted and scope}

    def club_role(self, club_id):
        """The most senior club role held in this club, or None."""
        held = [name for name, scope in self._parsed
                if name in R.CLUB_ROLES and scope == str(club_id)]
        return min(held, key=R.seniority) if held else None

    def has_club_role(self, club_id, *allowed):
        return self.club_role(club_id) in set(allowed)

    def is_dean(self):
        return self.has_any(R.DEAN)

    def is_admin(self):
        return self.has_any(R.ADMIN)

    def can_see_all_clubs(self):
        """
        Cross-club visibility of AGGREGATES and of the work itself: events,
        budgets, approval queues, the venue calendar.

        Deliberately not the same question as `can_see_individual_records`. One
        predicate answering both is what let the Vice-Chancellor read attendee
        PRNs; see the docstring below.
        """
        return self.has_any(R.DEAN, R.VICE_CHANCELLOR, R.ADMIN, R.CULTURAL_SOCIETY)

    def can_see_individual_records(self):
        """
        Names and PRNs of identifiable students, across clubs.

        The Vice-Chancellor is excluded on purpose. AGENT_PROMPT §6 grants them
        "above-threshold budgets, fests, semester report. No individual records";
        Database_And_Data_Flow §6.2 says they cannot read individual participation
        records; Event_Flows §14.2 says "aggregate figures only". Management is a
        recipient of the report, not a browser of the roster.

        The Cultural Society is excluded too: it decides on proposals and budgets,
        which needs no attendee's name.

        Even for the Dean this is oversight, not routine browsing (Event_Flows
        §14.2) — every read of it is audited.
        """
        return self.has_any(R.DEAN, R.ADMIN)

    def organiser_events(self):
        return self.scopes_for(R.EVENT_ORGANISER)

    def __str__(self):
        return f"{self.display_name} [{', '.join(self.roles)}]"


class AnonymousContext(AuthContext):
    def __init__(self):
        from integrations.base import Claims

        super().__init__(Claims(sub="", email=""))

    def has_any(self, *names):
        return False

    def can_see_all_clubs(self):
        return False


class ClaimsAuthentication(BaseAuthentication):
    keyword = "Bearer"

    def authenticate(self, request):
        header = request.headers.get("Authorization", "")
        if not header:
            request.auth_context = AnonymousContext()
            return None
        parts = header.split()
        if len(parts) != 2 or parts[0].lower() != self.keyword.lower():
            raise AuthenticationFailed("Authorization header must be: Bearer <token>")
        try:
            claims = identity_provider().authenticate(parts[1])
        except InvalidCredential as exc:
            raise AuthenticationFailed(str(exc)) from exc
        context = AuthContext(claims)
        request.auth_context = context
        return (ClaimsUser(context), claims)

    def authenticate_header(self, request):
        return self.keyword


class ClaimsUser:
    """
    A DRF-compatible user built from claims alone.

    Deliberately not a database row: §5.1 step 8 says the token carries name,
    PRN, department, programme, year and roles precisely so that rendering a page
    does not require a call back to the platform. `.record` is the escape hatch
    for the rare case that needs more.
    """

    is_authenticated = True
    is_anonymous = False

    def __init__(self, context):
        self.context = context
        self.id = context.sub
        self.pk = context.sub
        self.display_name = context.display_name

    def __str__(self):
        return self.display_name or self.id

    @property
    def record(self):
        from identity.models import User

        return User.objects.filter(pk=self.id).first()
