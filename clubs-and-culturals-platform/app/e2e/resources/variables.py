"""Environment for the Robot suites. Every value has a default for the local run."""
import os

API_BASE = os.environ.get("API_BASE", "http://localhost:8813/api/v1")
WEB_BASE = os.environ.get("WEB_BASE", "http://localhost:5213")
SEED_PASSWORD = os.environ.get("SEED_PASSWORD", "culturals-demo")
MFA_CODE = os.environ.get("MFA_CODE", "123456")
# Same value as JOBS_TOKEN in backend/.env (32+ characters, or the route answers 503).
JOBS_TOKEN = os.environ.get("JOBS_TOKEN", "e2e-jobs-token-0123456789abcdef0123456789abcdef")

# seed_demo is deterministic (random.Random(42)), so these accounts are stable.
STUDENT_EMAIL = "22bb1055@college.edu"          # no club at all
STUDENT_2_EMAIL = "22la1052@college.edu"        # two more club-less students, for the waitlist
STUDENT_3_EMAIL = "22la1054@college.edu"
DOOR_STUDENT_EMAIL = "23ar1057@college.edu"     # never registered anywhere by the seed
SYNC_STUDENT_EMAIL = "22me1058@college.edu"     # likewise
MEMBER_EMAIL = "23bb1010@college.edu"           # Music Club member
SECRETARY_EMAIL = "25la1004@college.edu"        # Music Club secretary
TREASURER_EMAIL = "24ec1003@college.edu"        # Music Club treasurer
PRESIDENT_EMAIL = "25la1001@college.edu"        # Music Club president
LENS_PRESIDENT_EMAIL = "22la1031@college.edu"   # Photography Club president, runs the live event
LENS_TREASURER_EMAIL = "23la1033@college.edu"
DANCE_PRESIDENT_EMAIL = "25ar1015@college.edu"
DANCE_TREASURER_EMAIL = "25la1017@college.edu"
THEATRE_MEMBER_EMAIL = "24la1046@college.edu"
SOCIETY_EMAIL = "cultural.secretary@college.edu"
DEAN_EMAIL = "dean@college.edu"
VC_EMAIL = "vc@college.edu"

# Seeded events, by title (seed_demo.py `specs`).
LIVE_EVENT = "Heritage Photowalk"
PUBLISHED_EVENT = "Literary Quiz"
STREET_PLAY = "Street Play"                       # submitted, Theatre Club, Society -> Dean
OPEN_MIC = "Open Mic Night"                       # submitted, clashes with the workshop
DANCE_WORKSHOP = "Contemporary Dance Workshop"    # submitted, same hall, same evening
CULTURALS_NIGHT = "Culturals Night 2026"          # submitted, above the VC threshold
REPORTED_EVENT = "Dance Showcase"                 # reported, sanctioned, not settled
UI_DOOR_STUDENT_EMAIL = "23me1048@college.edu"  # club-less, never registered by the seed; the UI scan suite uses it

# ---- added with the regression pack (api/09+, ui/16+) ----
import os as _os
_HERE = _os.path.dirname(__file__)
DB_PATH = _os.environ.get("DB_PATH", _os.path.join(_HERE, "..", "..", "backend", "db.sqlite3"))  # same default as db.py
FIXTURES = _os.path.join(_HERE, "..", "fixtures")
PHOTO_FIXTURE = _os.path.join(FIXTURES, "photo.png")
# Written by `run.sh tables` / ci.sh from Django's own model registry, so the schema check never drifts.
EXPECTED_TABLES_FILE = _os.environ.get("EXPECTED_TABLES_FILE", _os.path.join(_HERE, "..", "results", "expected_tables.json"))
# A club with no seeded roster and no seeded events; the suites flip its join mode and put it back.
OPEN_CLUB_NAME = "Astronomy Club"
# Seed minimums for the core tables (clubs and events are exact in seed_demo; the rest only grow).
SEEDED_TABLES = {
    "identity_user": 60, "identity_student": 60, "identity_semester": 1,
    "clubs_club": 23, "clubs_membership": 46,
    "events_venue": 5, "events_event": 14,
    "budget_budgettemplate": 4, "budget_budget": 14, "budget_budgetline": 14,
    "governance_approvalrequest": 8, "governance_approvalstep": 4,
    "governance_auditentry": 1, "governance_notification": 1,
    "participation_registration": 1, "participation_eventpass": 1, "participation_scanrecord": 1,
}

# ---- added with ui/22 (the whole post-event report form) ----
PHOTO_STAGE_FIXTURE = _os.path.join(FIXTURES, "photo_stage.png")
PHOTO_CROWD_FIXTURE = _os.path.join(FIXTURES, "photo_crowd.jpg")
POST_SCREENSHOT_FIXTURE = _os.path.join(FIXTURES, "post_screenshot.png")
BILL_FIXTURE = _os.path.join(FIXTURES, "bill.pdf")
NOT_A_PHOTO_FIXTURE = _os.path.join(FIXTURES, "not_a_photo.txt")

# ---- added with api/18–19 and ui/23–24 (Society officers, proposal documents, previews) ----
SOCIETY_VICE_EMAIL = "cultural.vicesecretary@college.edu"   # Society Vice-Secretary: holds the Society stage
SOCIETY_MEMBER_EMAIL = "cultural.member@college.edu"        # plain Society member: sees, decides nothing
PROPOSAL_PDF_FIXTURE = _os.path.join(FIXTURES, "proposal.pdf")
PROPOSAL_PDF_V2_FIXTURE = _os.path.join(FIXTURES, "proposal_v2.pdf")
PROPOSAL_DOCX_FIXTURE = _os.path.join(FIXTURES, "proposal.docx")      # heading, paragraph, one table row
PROPOSAL_DOC_FIXTURE = _os.path.join(FIXTURES, "proposal_legacy.doc")  # accepted, never previewed
EMPTY_PDF_FIXTURE = _os.path.join(FIXTURES, "empty.pdf")
BUDGET_CSV_FIXTURE = _os.path.join(FIXTURES, "budget_ok.csv")         # two lines, 15000 in all
