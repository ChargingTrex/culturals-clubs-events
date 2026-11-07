# Post-event reporting — gap audit and implementation plan

Written 2026-11-05 against PRD V4 §5.10, §5.12.3, §5.14, §6, §7; Event_Flows V2 §5.5;
Database_And_Data_Flow §3.15. Board rows: CHECKLIST.md D-01, D-02, D-05, D-11 (plus
one new row, D-18, for the status job). Code state is branch `design-system-ui` at b38931e.

## 1. What is implemented today

| PRD item | State | Where |
|---|---|---|
| Attendance capture: QR scan, spot/manual check-in, registered vs attended vs no-show, capture-rate metrics | **Done** | `participation/`, `reporting/services.py: capture_metrics` |
| Close an event with evidence; ≥1 photo required; status → `reported` | **Done, as a count** | `events/services.py: close_event` takes `photo_count` (int) + `social_links` (URL list) |
| Dean overview: completed events missing photos / social links | **Done** | `reporting/services.py: dean_overview` → `missing_evidence`, `events_missing_photos`, `events_missing_social_links`; `staff/OverviewPage.tsx` |
| Semester report: events run, participation, unique students, by club/category/department, money, per-event photo count + links, CSV | **Done** | `reporting/services.py: semester_report`, `reporting/export.py`, `staff/ReportPage.tsx` |
| Feedback after close (1–5 rating, attendees only) | **Done**, not dispatched | `feedback/` — opens on close, nobody is told |
| Club Instagram handle | **Done** (Instagram only) | `Club.instagram_handle` |
| Club close UI | **Done, minimal** | `club/ClubEventDetailPage.tsx: CloseForm` — a number box and a space-separated URL box |

## 2. What the PRD asks for that is missing

| # | PRD | Gap |
|---|---|---|
| G1 | 5.10 | No photo **files**. No `EventPhoto` rows, no upload, no gallery, no highlight flag, no caption, no consent notice, no removal request. `photo_count` is self-reported. |
| G2 | 5.14.1 | No `EventSocialPost` rows: no platform, no who/when, no screenshot. Links only at close, not pre-event. No "mandatory for larger events" setting. No LinkedIn handle on the club. |
| G3 | 5.14.2 | No per-club social activity (share of events with a post, last post date, platform split). No outreach line in the semester report. |
| G4 | 5.12.3 / 7 | No `EventReport`: no outcomes, no learnings, no auto-drafted prefill (attendance, registrations, sanctioned budget). |
| G5 | 5.12.3 / 5.8 | Feedback survey is not dispatched to attendees at close. |
| G6 | 5.11 / Flows 5.5 | Nothing moves `live` → `completed`; close jumps straight to `reported`. So "completed but no report after N days" cannot be flagged and is not on the Dean's list. |
| G7 | 6.1 / 6.4 | Report has no photos (club highlight, highlights spread, gallery), no PDF/PPTX. |
| G8 | 5.2 / Flows | Club profile has no past reports or photo highlights (blocked on F-06.2, the club page, still open). |
| G9 | 5.12.3 | Participation certificates, vendor quality rating. |

Not planned here: G9 (certificates need a template engine and a verify page; vendor
rating overlaps `ReceiptDocument.vendor`), PPTX export, clone-forward of learnings
(D-03), compressed image variants. Each is named below where it was cut.

## 3. Design — the smallest change that covers G1–G8

Rules kept from AGENT_PROMPT: DB stores file **keys**, never bytes; link capture only,
no social API; attendance is never re-entered at close.

### 3.1 Models (`events/models.py`, one migration)

```
EventPhoto(UUIDModel)
  event FK CASCADE related_name="photos"
  file_key, file_name, content_type, byte_size, sha256   # same shape as ReceiptDocument
  caption CharField(300, blank)
  is_highlight BooleanField(default=False)
  uploaded_by_sub UUIDField(null)
  removal_requested_by_sub UUIDField(null), removal_requested_at DateTimeField(null)
  removed_at DateTimeField(null)          # soft delete: the semester figure "photos" must not shrink later
  Meta: ordering ("created_at",), index (event, removed_at)

EventSocialPost(UUIDModel)
  event FK CASCADE related_name="social_posts"
  platform CharField choices instagram|linkedin|other
  url URLField(500)
  screenshot_key CharField(400, blank)    # optional; reuses the file store
  added_by_sub UUIDField(null)
  Meta: unique (event, url); ordering ("created_at",)   # created_at is the capture date (DB §3.15)

EventReport(UUIDModel)
  event OneToOne CASCADE related_name="report"
  outcomes TextField
  learnings TextField(blank)
  submitted_by_sub UUIDField(null), submitted_at DateTimeField
```

Drop `Event.photo_count` and `Event.social_links`. The API keeps both names as
read-only computed values (`photo_count` = live photos, `social_links` = post URLs) so
`ReportPage`, `OverviewPage`, the CSV and `test/server.ts` keep working. No data
migration: the only database with rows is the local demo, re-seeded by `seed_demo`
(H-02 hosted DB is not live yet).

`Club.linkedin_handle` CharField(64, blank) next to `instagram_handle`. That is the
whole of "ClubSocialHandle"; a table for two strings is not needed.

Settings: `SOCIAL_POST_REQUIRED_ABOVE = _env_int(..., 0)` — attended count above which
closing needs ≥1 post; 0 = never (PRD 5.14.3 caution: larger events only).
`REPORT_DUE_DAYS = _env_int(..., 7)`.

### 3.2 Endpoints (`events/views.py`, copy the receipt pattern from `budget/views.py: attach_receipt` / `receipt_file`)

| Method | Path | Who | Body / result |
|---|---|---|---|
| GET | `/events/{id}/photos` | public for `PUBLIC_STATUSES`, else club/staff | `[{id, caption, is_highlight, file_url, created_at}]`, removed excluded |
| POST | `/events/{id}/photos` | `EVENT_OPERATORS`, organiser, dean; status ≥ approved | multipart `file` (jpeg/png/webp/heic only — `RECEIPT_CONTENT_TYPES` minus pdf), `caption?` → 201 |
| PATCH | `/events/{id}/photos/{pid}` | same | `{caption?, is_highlight?}` |
| DELETE | `/events/{id}/photos/{pid}` | same | sets `removed_at` |
| GET | `/events/{id}/photos/{pid}/file` | as GET list | stream (local) or 302 (platform), exactly like `receipt_file` |
| POST | `/events/{id}/photos/{pid}/removal-request` | any signed-in student | marks the row; notifies club officers (`photo.removal_requested`) — PRD 5.10 consent |
| POST | `/events/{id}/social-posts` | operators/organiser/dean; status ≥ approved | `{url, platform?}` — platform inferred from host when omitted; optional `screenshot` multipart |
| DELETE | `/events/{id}/social-posts/{sid}` | same | hard delete (a wrong link is not evidence) |
| GET | `/events/{id}/report` | operators/organiser/staff | the **auto-draft**: `{attended, registered, no_show, spot, external, sanctioned, spent, photos, social_posts, feedback{count, avg_rating}, outcomes, learnings, submitted_at}` — numbers from existing model methods, text from `EventReport` if saved |
| POST | `/events/{id}/close` | unchanged roles | **new body** `{outcomes, learnings?}`; `close_event` now checks `event.photos.filter(removed_at=null).exists()` (409 `EVENTS_EVIDENCE_REQUIRED` kept), the social threshold (409 `EVENTS_SOCIAL_POST_REQUIRED`, new), writes `EventReport`, sets `reported`, then dispatches feedback (3.4) |

`EventSerializer` gains `highlight_photo_url` (first highlight, else first photo) for cards.

### 3.3 Reporting (`reporting/services.py`, serializers, export)

- `dean_overview`: add `events_missing_report` (status `completed` older than `REPORT_DUE_DAYS`); add
  `social_activity[{club_id, club, events_completed, events_with_post, share, last_post_at, instagram, linkedin, both}]`
  and `clubs_without_recent_post` (window `DORMANCY_DAYS`). Existing missing-* lists now read the rows.
- `semester_report`: `by_club[].highlight_photo_url`; `highlights[{event, club, attended, outcomes (first 200 chars), photo_url}]` =
  top 6 reported events by attendance that have a highlight; `gallery[]` = all highlight photos of the semester;
  `outreach{events_promoted, events_completed, by_platform{instagram, linkedin}, clubs[]}`. CSV gets one outreach row.
- PDF: `ReportPage` gets a print stylesheet and a "Print / Save as PDF" button. `shortcut: browser print only, no server PDF or PPTX — upgrade (D-11) when the Dean asks for a file by email`.

### 3.4 Automation (`jobs/services.py`, `vercel.json` crons)

- `complete-ended`: every hour, `live`/`published` events with `ends_at < now − ORGANISER_GRACE_HOURS` → `completed`. One new row in the jobs table and one cron line. Closes G6.
- Feedback dispatch at close: inside `close_event`, notify every attended student (`feedback.requested`, link `/events/{id}`) through the existing `participation/signals.py` notifier pattern. Closes G5.

### 3.5 Frontend

- `club/ClubEventDetailPage.tsx`: replace `CloseForm` with a **Report panel** shown from `approved` onward:
  photo grid (multi-file input, caption, highlight star, remove), social post list (URL + platform pill, add/remove),
  and from `live`/`completed` the auto-draft block (read-only numbers) with Outcomes (required) and Learnings textareas and the Close button. `club/api.ts` gets the six calls.
- `student/EventDetailPage.tsx`: consent line on the Register panel ("Event photos may be used in college reports; you can ask for one to be removed"); gallery for `completed`/`reported` with "Request removal" per photo.
- `staff/OverviewPage.tsx`: "No report yet" list and a social-activity table. `staff/ReportPage.tsx`: highlight photo per club row, highlights spread, gallery strip, outreach line, print button.
- `student/ClubsPage.tsx` club card shows the two handles; the gallery/past-reports tab waits for F-06.2.
- Regenerate `shared/api/schema.d.ts`; update `test/server.ts` mocks.

## 4. Work split and order

| Step | Owner | Scope | Done when |
|---|---|---|---|
| 1 | W-backend | 3.1 models + migration, `seed_demo` creates photos (a bundled 1-pixel-style demo JPG per reported event) and posts, drop the two columns | `manage.py migrate`, `seed_demo`, 434 existing tests green after fixing `test_reporting.py`, `test_report_export.py`, `test_budget_and_roles.py` (they call close with `photo_count`) |
| 2 | W-backend | 3.2 endpoints, 3.4 job + dispatch, `spectacular --fail-on-warn` clean | new tests: upload type refusal, close without photo 409, close above social threshold 409, removal request notifies officers, report prefill numbers, `complete-ended` flips only ended events, feedback notification created per attendee |
| 3 | W-backend | 3.3 reporting | tests: missing-report list after `REPORT_DUE_DAYS`, social activity shares, outreach counts, CSV row, VC still sees no PRNs |
| 4 | W-frontend | 3.5, after step 2 publishes `schema.d.ts` | vitest: report panel uploads then closes; student gallery renders; overview lists missing reports |
| 5 | QA | Robot: extend `e2e/ui/12_treasurer_and_president.robot` with upload → post → close → feedback notification; `e2e/api` has **no close coverage today**, add one | `./run.sh api` and `ui` green on a fresh `seed_demo`; findings in `docs/qa/` |
| 6 | W-hosting (H-02) | `S3FileStore` (Cloudflare R2 or Supabase Storage, boto3 — the one new dependency) registered under `"files"` in `integrations/registry.py`; `url_for` returns a short-lived signed URL | receipts **and** photos survive a redeploy on Vercel (HOSTING.md "No local disk") |

Steps 1–3 are one worktree; 4 can start on the mocked schema once step 2's serializers are
committed. Step 6 is independent and is the prerequisite for testing uploads on the hosted stack.

## 5. Decisions needed from the Student Life Office (PRD §9, carried over)

- Social post required above what attendance? Default 0 (never) until answered.
- Report due within how many days of the event? Default 7.
- Photo retention: PRD says indefinite with removal on request; the plan keeps the row and hides the file.

## 6. Not built, deliberately

Certificates and vendor rating (G9), PPTX, server-side PDF, compressed image variants,
learnings carried into clone (needs D-03), automated handle-vs-link sense check
(PRD says spot-check by hand). Each is a later wave, not a hidden omission.
