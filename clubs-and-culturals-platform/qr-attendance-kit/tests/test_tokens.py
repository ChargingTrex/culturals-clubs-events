import sys, types, time
# minimal django.conf stub so tokens.py imports standalone
dj = types.ModuleType("django"); conf = types.ModuleType("django.conf")
class S: QR_SIGNING_KEYS={"v1":"a"*40,"v2":"b"*40}; QR_ACTIVE_KEY_ID="v2"
conf.settings=S(); dj.conf=conf
sys.modules["django"]=dj; sys.modules["django.conf"]=conf
sys.path.insert(0,"/home/claude/qr-attendance-kit")
from core import tokens as t

ok=lambda m: print(f"  PASS  {m}")

# round trip
tok=t.issue_profile_token("student-123")
p=t.verify(tok, expect_purpose=t.PURPOSE_PROFILE)
assert p.subject=="student-123"; ok("profile round-trip")

# purpose isolation: cert token rejected at scan station
ct=t.issue_certificate_token("C1", prn="21CS1042", event="Velora")
try:
    t.verify(ct, expect_purpose=t.PURPOSE_PROFILE); raise SystemExit("FAIL purpose")
except t.TokenWrongPurpose: ok("certificate token rejected as profile QR")

# event binding
ep=t.issue_event_pass("reg-1","event-A")
t.verify(ep, expect_purpose=t.PURPOSE_EVENT_PASS, expect_event="event-A"); ok("pass accepted for its event")
try:
    t.verify(ep, expect_purpose=t.PURPOSE_EVENT_PASS, expect_event="event-B"); raise SystemExit("FAIL event")
except t.TokenWrongPurpose: ok("pass rejected for a different event")

# tamper
bad=tok[:-3]+"xyz"
try:
    t.verify(bad, expect_purpose=t.PURPOSE_PROFILE); raise SystemExit("FAIL tamper")
except t.TokenInvalid: ok("tampered signature rejected")

# payload tamper
kid,pl,sg=tok.split(".")
try:
    t.verify(f"{kid}.{t._b64e(b'{\"p\":\"profile\",\"s\":\"attacker\"}')}.{sg}", expect_purpose=t.PURPOSE_PROFILE)
    raise SystemExit("FAIL payload")
except t.TokenInvalid: ok("forged payload rejected")

# expiry
ex=t.issue(t.PURPOSE_EVENT_PASS,"r",event_id="e",ttl_seconds=-1)
try:
    t.verify(ex, expect_purpose=t.PURPOSE_EVENT_PASS); raise SystemExit("FAIL exp")
except t.TokenExpired: ok("expired pass rejected")

# key rotation: v1-signed token still verifies after active key moved to v2
S.QR_ACTIVE_KEY_ID="v1"; old=t.issue_profile_token("s9")
S.QR_ACTIVE_KEY_ID="v2"; new=t.issue_profile_token("s9")
assert old.startswith("v1."); assert new.startswith("v2.")
t.verify(old, expect_purpose=t.PURPOSE_PROFILE); ok("old key still verifies after rotation")

# url-safety
assert all(c not in tok for c in "+/= "); ok("token is URL/QR safe")
print("\n8/8 passed")
