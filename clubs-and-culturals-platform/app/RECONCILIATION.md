# Reconciliation record — two parallel backend drafts

On 2026-09-23 two agent sessions built this backend concurrently, in the same
directory, without either knowing the other was there. They collided: session B
overwrote session A's `participation` app and `config/urls.py`, and the tree
stopped importing (`reporting/services.py` referenced `ACCEPTING`, which B's
models did not define).

There is no git history here, so B's overwrite of A's `participation/models.py`,
`services.py`, `views.py` and `urls.py` is unrecoverable. What follows is what was
kept from each draft and why. **The point of this file is that these decisions do
not get re-litigated** — if you disagree with one, change it deliberately and
amend the row.

## Decisions

| Concern | Kept from | Why |
|---|---|---|
| QR token crypto (`qrkit/`) | **B** | B's version requires `QR_SIGNING_KEYS` explicitly. A's fell back to `SECRET_KEY`, which ties QR signing to the Django secret — rotating that secret after a leak would invalidate every pass and certificate ever issued, which the kit's README specifically warns against. B's also checks minimum key length and carries the MIT attribution for the code it derives from. |
| Pass token subject | **B** | The subject is the `EventPass` row id, not the registration id. The kit as shipped signed the registration id while its scanner looked the subject up as a pass, so **no pass it issued could ever be redeemed** — branches 1 and 2 of the seven would have failed on every real pass. The pass row is the right subject: it is what carries `used_at`. |
| Distinct token exceptions | **B** | `TokenInvalid` / `TokenExpired` / `TokenWrongPurpose` map to three different operator actions at a gate. A collapsed them into one, which would have shown "invalid code" to someone holding a merely expired pass. |
| Storing the pass token on the row | **A** | B re-minted on read. Minting embeds a fresh `iat`, so a screenshotted or printed pass would stop matching the row, and the unique index could not catch a collision. The row stores the canonical token. |
| `EventPass` as FK + partial unique | **B** | A used a `OneToOne`, which cannot express reissue-with-revocation. B's shape lets a lost pass be replaced while the history of what was issued survives, and a forwarded screenshot stops working. |
| `EventPass.key_id` | **B** | Records which signing key minted each pass. After a rotation this is the only way to tell which passes in circulation depend on a key you are about to remove. |
| `ScanRecord.synced_at` / `was_offline` | **B** | Distinguishes a scan taken offline and replayed from one taken live. |
| `ScanResult.EXPIRED` | **B** | A distinct branch, because it calls for a distinct action at the door. |
| `ScanResult` at module level, plus `ACCEPTING` | **A** | Reporting and the services layer both branch on it; nested inside `ScanRecord` it reads as the scan log's private business when it is shared vocabulary. |
| `ExternalParticipant` + `Registration.external` | **A** | Rule 7: own students and external participants are counted separately and never summed. B had no external participants at all, so a fest's outside attendees would have been reported as institutional reach. |
| `StudentQRToken` | **A** | The persistent profile QR (AGENT_PROMPT §2), with versioned revocation so a lost phone can be reissued. B had no model for it. |
| `ScanRecord.offline_ref` + unique constraint | **A** | Idempotency for replay. A station whose sync response is lost will retry, and without this the same scan is recorded twice. |
| `Registration.snapshot_from()` | **B** | Small, and it keeps the three snapshot fields set in one place. |
| `IsEventOrganiser` permission class | **B** | B's checks a station token's `scan_event` against the event being scanned and refuses a mismatch outright. A's inline check did not, so a station token for event X could be used at event Y by anyone holding a club role — a real hole. |
| `DOOR_STAFF` excluding Treasurer | **B** | The scan response carries attendee names and PRNs. A treasurer handles money, not the door. |
| Service API (`register_student`, `resolve`, …) | **A** | `seed_demo`, `events/`, `budget/`, `governance/` and `reporting/` all call it. |
| `config/urls.py` namespacing | **A** | B mounted identity at `/api/v1/auth/` and Django admin at `/admin/`. API_Standards §3.1 reserves `auth` and `admin` for the platform, so these are `/api/v1/module/` and `/django-admin/`. |
| `PURPOSE_CERTIFICATE` | **B** | The kit is an attendance *and certificate* kit. The portal is not built, but keeping the purpose means adding it later needs no change to the signing format. |

## Things the reconciliation itself changed

Found while getting the merged tree green:

- **`GOVERNANCE_WRONG_STAGE` was unreachable.** `assert_can_decide` defaulted its
  `stage` argument to `current_stage`, so the comparison never fired and an
  approver waiting their turn got a flat `403 NOT_APPROVER`. Now a caller who holds
  a gate *later on this route* gets `409 WRONG_STAGE` naming who has it, and only
  a caller with no gate at all gets 403.
- **All routers were appending trailing slashes.** API_Standards §3.2 writes every
  path without one (`POST /events/{id}/approve`); DRF's `DefaultRouter` defaults to
  adding one, turning each documented POST into a `301` that drops the body. All
  five routers now pass `trailing_slash=False`.
- **A Postgres-only lookup in a core path.** `global_roles__contains` on a
  JSONField is PostgreSQL-only, so notifying an approval stage's holders crashed on
  any other backend. `User.objects.with_global_role()` now uses the indexed lookup
  where it exists and filters in Python otherwise.

## Known gaps

- **18 `drf-spectacular` schema errors**, all the same cosmetic cause: plain
  `APIView`s that return ad-hoc dicts have no inferable *response* serializer.
  Paths and request bodies are documented; response shapes are not. Fixing it means
  writing response serializers for ~18 endpoints.
- **No `/verify/{token}` certificate portal.** Documented by the kit, not built.
- **`qrkit/` is vendored, not a dependency.** It derives from two MIT-licensed
  ChargingTrex repos; see `clubs-and-culturals-platform/qr-attendance-kit/docs/LICENSING.md`,
  which notes one repo's licence constrains a decision that has not been made yet.
