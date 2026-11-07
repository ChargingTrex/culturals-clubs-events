# QR Attendance & Certificate Kit — self-hostable

Django implementation of QR attendance and certificate verification for the Clubs & Events module. Takes the two ChargingTrex projects as starting points and rebuilds them to meet the PRD.

**Read [`docs/LICENSING.md`](docs/LICENSING.md) first.** The two source repos carry different licences and one of them constrains a decision you have not made yet.

---

## Why not just deploy the originals

Both work, and for a single club running one event a month, Google Apps Script is a reasonable answer. They stop being reasonable at the scale and integrity standard your PRD sets.

| Original behaviour | Problem at your scale | What this kit does |
|---|---|---|
| Google Sheets as the database | Read-decide-write with no locking. Two stations scanning one person both read "absent", both write "present". The duplicate vanishes silently. | PostgreSQL; a partial unique index makes the second write *fail*, and the failure is the correct answer |
| Apps Script execution limits | 6-minute cap, ~100 emails/day on consumer accounts. A 2,000-person fest cannot issue passes. | Celery; no per-run cap |
| Sheet serialises writes | A queue at one door slows every other door | Row-level locks; doors are independent |
| `goqr.me` external API for QR images | Every code sends a student-identifying token to an unassessed third party. Bulk issuance = thousands of outbound calls. | Local generation via `qrcode` (BSD). No network calls |
| Requires live connectivity per scan | Weak venue signal stops check-in mid-queue; club reverts to paper | Offline queue with device timestamps, replayed on reconnect |
| Hard-coded sheet columns (B, C, E, G, H, J) | Anyone inserting a column silently corrupts attendance | Named model fields |
| `SECRET_KEY` in source, single key | Rotation invalidates every certificate ever issued | Versioned key IDs; old keys keep verifying |
| Token = HMAC of ID, no expiry or scope | A certificate token is structurally a valid attendance token | Purpose binding + event binding + optional expiry |
| Signature compared with `==` | Timing side-channel | `hmac.compare_digest` |
| Web app deployed "Anyone" | Anyone with the URL can mark attendance | JWT auth + organiser-scoped permission |
| No record of failed scans | A station rejecting half the queue looks like a quiet event | Every attempt logged; capture-rate metric derives from it |

---

## Layout

```
core/
  tokens.py       signed token issue/verify — derived from the MIT cert repo
  qr.py           local QR rendering, no external API
scanner/
  services.py     ScanService — the seven resolution branches
  views.py        scan, offline sync, roster endpoints
certificates/     verification portal
docs/
  LICENSING.md    read this first
```

---

## Install

```bash
python -m venv .venv && source .venv/bin/activate
pip install django djangorestframework psycopg[binary] celery redis "qrcode[pil]"
```

`qrcode[pil]` is BSD-licensed and makes no network calls.

## Configure

```python
# settings.py
import os

QR_SIGNING_KEYS = {
    "v1": os.environ["QR_KEY_V1"],       # keep old keys listed
    "v2": os.environ["QR_KEY_V2"],
}
QR_ACTIVE_KEY_ID = "v2"                  # new tokens signed with this
CERTIFICATE_VERIFY_BASE = "https://verify.yourcollege.edu"
```

Generate a key:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

**Never commit these.** Environment variables or a secrets manager only. A leaked signing key lets anyone mint valid attendance passes and forge certificates — the whole security model rests on it.

## Rotating a key

1. Add `v3` to `QR_SIGNING_KEYS`, leaving `v2` in place.
2. Set `QR_ACTIVE_KEY_ID = "v3"`.
3. New tokens sign with v3; everything signed with v2 keeps verifying.
4. Remove `v2` only when you are willing to invalidate every token it signed — for certificates, that is likely never.

---

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/participation/events/{id}/scan` | Single scan |
| POST | `/api/v1/participation/events/{id}/scan/sync` | Replay offline queue (≤500) |
| GET | `/api/v1/participation/events/{id}/roster` | Cache for offline + PRN search fallback |
| GET | `/verify/{token}` | Public certificate verification |

### Scan response

```json
{
  "result": "accepted",
  "ok": true,
  "message": "Checked in",
  "student": { "display_name": "…", "prn": "21CS1042",
               "programme": "BTech-CSE", "year": 2 },
  "checked_in_at": "2026-09-12T04:30:00Z",
  "registration_id": "…"
}
```

`result` is one of: `accepted`, `spot_registered`, `duplicate`, `wrong_event`, `not_registered`, `unknown_code`, `expired`.

A duplicate returns **200, not 409** — it is a correct expected answer the operator must see, and the station renders every outcome identically.

---

## Offline behaviour

1. Station fetches the roster and caches it before the event.
2. Scans queue locally with the **device's** timestamp.
3. On reconnect, the queue posts to `/scan/sync`.
4. The server sorts by device timestamp before replaying.

That last step matters: without it, whichever station uploaded first would win, and the "duplicate" would be assigned arbitrarily rather than to the genuinely later scan.

---

## Running the tests

The token module has no Django dependency beyond `settings`, so it tests standalone:

```bash
python -m pytest tests/test_tokens.py -v
```

Covers round-trip, purpose isolation, event binding, tampered signature, forged payload, expiry, key rotation, and URL-safety.

---

## What is deliberately not here

- **Bulk email.** Your PRD routes all notification through the shared notification service (in-app + email only). A second mail path inside this module would bypass that policy.
- **Certificate design.** As the original notes, this issues and verifies codes; it does not lay out certificates.
- **Google Sheets sync.** If clubs want a spreadsheet, export from the module. Two-way sync means two sources of truth and eventually two different attendance figures.
