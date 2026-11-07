"""
The role vocabulary, and how a scoped role string is read.

Identity_Login_Shared_Data §4 fixes role names as a shared list owned by the
platform: additions require agreement between both teams. They are declared
here once so no module invents one.

Two shapes exist:
  "dean"                                  global role
  "club_president:<club_uuid>"            role scoped to one object

Scoped roles are how "President of Swara" is expressed without a second lookup
on every request: the claim carries the scope, per §5.1 step 8.
"""

# --- Global roles ---------------------------------------------------------
STUDENT = "student"
CULTURAL_SOCIETY = "cultural_society"   # cultural society office bearer
DEAN = "dean"                           # Dean of Student Affairs
VICE_CHANCELLOR = "vice_chancellor"
ADMIN = "admin"                         # IT / platform administration

GLOBAL_ROLES = (STUDENT, CULTURAL_SOCIETY, DEAN, VICE_CHANCELLOR, ADMIN)

# --- Club-scoped roles, most senior first --------------------------------
CLUB_PRESIDENT = "club_president"
CLUB_VICE_PRESIDENT = "club_vice_president"
CLUB_TREASURER = "club_treasurer"
CLUB_SECRETARY = "club_secretary"
CLUB_CORE = "club_core"
CLUB_MEMBER = "club_member"

CLUB_ROLES = (
    CLUB_PRESIDENT,
    CLUB_VICE_PRESIDENT,
    CLUB_TREASURER,
    CLUB_SECRETARY,
    CLUB_CORE,
    CLUB_MEMBER,
)

# --- Event-scoped role ---------------------------------------------------
# Time-bound: granted for the run-up to one event and expiring with it, so an
# organiser sees attendee identities for their own event only (AGENT_PROMPT §6).
EVENT_ORGANISER = "event_organiser"

SCOPED_ROLES = CLUB_ROLES + (EVENT_ORGANISER,)

ALL_ROLES = GLOBAL_ROLES + SCOPED_ROLES

# --- Capability sets -----------------------------------------------------
# Who may assign club roles. AGENT_PROMPT §6: Treasurer cannot, and that
# restriction is checked when a change is saved, not by hiding the control.
ROLE_ASSIGNERS = (CLUB_PRESIDENT, CLUB_VICE_PRESIDENT)

# Who may see a club's budget. Club members deliberately cannot (§6).
BUDGET_VIEWERS = (CLUB_PRESIDENT, CLUB_VICE_PRESIDENT, CLUB_TREASURER)

# Who may build the budget before submission: add, edit and remove lines, and
# declare that an event needs no money at all.
#
# The Treasurer is the point of this set. PRD §4 makes preparing budget requests
# their job, so they must be able to add the entries, not only fill in spend
# against entries somebody else typed.
BUDGET_PREPARERS = (CLUB_PRESIDENT, CLUB_VICE_PRESIDENT, CLUB_TREASURER)

# Who may enter spend and attach receipts.
#
# The Vice-President is included because PRD §5.19.2 and Event_Flows §9.2 both
# answer "Record actual spend, upload receipts" with Yes for them — the Treasurer
# is the "primary owner", not the only one. A club whose treasurer is unreachable
# in exam week still has to settle.
BUDGET_SETTLERS = (CLUB_PRESIDENT, CLUB_VICE_PRESIDENT, CLUB_TREASURER)

# Who may raise a proposal and its budget request on the club's behalf.
#
# The Treasurer is included because PRD §4 describes their job as "prepare budget
# requests, track sanctioned amounts, record actual spend", and both PRD §5.19.2
# and Event_Flows §9.2 answer "Create and submit a proposal" with Yes for them.
# A Treasurer who can record spend but cannot raise the request is backwards.
PROPOSERS = (CLUB_PRESIDENT, CLUB_VICE_PRESIDENT, CLUB_SECRETARY, CLUB_TREASURER)

# Who may run an event once it is approved — open it, and close it with evidence.
#
# Deliberately NOT the Treasurer. Preparing the budget is their job; running the
# event on the night is not, and closing it requires the photos and outcomes the
# people who were there hold. Keeping this separate from PROPOSERS is what lets
# the Treasurer raise a request without inheriting the event-day controls.
EVENT_OPERATORS = (CLUB_PRESIDENT, CLUB_VICE_PRESIDENT, CLUB_SECRETARY)

# Who may run a check-in station for their club's own event. A plain member
# deliberately cannot: the scan response carries attendee names and PRNs.
DOOR_STAFF = (CLUB_PRESIDENT, CLUB_VICE_PRESIDENT, CLUB_SECRETARY, CLUB_CORE)

# Approval stages, and the role that holds each one.
STAGE_ROLE = {
    "cultural_society": CULTURAL_SOCIETY,
    "dean": DEAN,
    "vc": VICE_CHANCELLOR,
}

# Roles for which MFA is mandatory (§5.5).
MFA_REQUIRED_ROLES = (DEAN, VICE_CHANCELLOR, ADMIN, CULTURAL_SOCIETY)


def split_role(role):
    """`"club_president:abc"` -> `("club_president", "abc")`; global -> scope None."""
    name, _, scope = role.partition(":")
    return name, (scope or None)


def scoped(name, scope):
    return f"{name}:{scope}"


def seniority(role_name):
    """Lower is more senior. Unknown roles sort last."""
    try:
        return CLUB_ROLES.index(role_name)
    except ValueError:
        return len(CLUB_ROLES)
