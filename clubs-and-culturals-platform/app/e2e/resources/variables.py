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
