"""
Scheduled jobs, as plain functions.

docs/COMPLETION_PLAN.md §2: the test host (Vercel) has no Celery worker, so every
job here is reachable two ways — as a Celery task (jobs/tasks.py, for a real
worker later) and as a token-guarded HTTP trigger (jobs/views.py, for Vercel
Cron). Both call `run_job`, so the behaviour cannot drift between them.

Every completed run writes one AuditEntry carrying counts only (AGENT_PROMPT §7:
audit consequential changes; AGENT_PROMPT §6: no name or PRN in anything a
non-organiser can read, and the audit log is readable by the VC).
"""
import logging
from datetime import timedelta
from types import SimpleNamespace

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from common import roles as R
from common.errors import ProblemDetail
from integrations.registry import audit_sink, notifier
from participation.models import ACCEPTING, ExternalParticipant, ScanRecord

log = logging.getLogger(__name__)

# MASTER_SPEC §8.3: "ScanRecord — rolled up after one year. Aggregates kept, raw
# log trimmed." The year is the documented figure, not a tunable.
SCAN_ROLLUP_AFTER_DAYS = 365

# The actor on audit entries a job writes: nobody pressed anything.
SYSTEM_ACTOR = SimpleNamespace(sub="system:jobs", display_name="Scheduled job")

ESCALATION_KIND = "approval.escalated"


class JobNotWired(ProblemDetail):
    """501: the job exists, its dependency is not in this build yet."""

    def __init__(self, job, dependency):
        super().__init__(
            code="JOBS_NOT_WIRED", title="Job not wired", status_code=501,
            detail=f"{job} depends on {dependency}, which this build does not provide yet.",
        )


class Job:
    """What a job's audit entry points at: `target_type="Job"`, `target_id=<name>`."""

    def __init__(self, name):
        self.pk = name


# ---------------------------------------------------------------------------
# The jobs
# ---------------------------------------------------------------------------

def rollup_scans(*, now=None):
    """
    Database_And_Data_Flow §6.1 / MASTER_SPEC §8.3: ScanRecords older than a year
    are rolled up into per-event counts and the raw log is trimmed.

    Deletion is DEFERRED. The counts are computed and logged and nothing is
    removed, because no retention decision has been recorded (MASTER_SPEC §11
    carries retention as open, and there is no `ScanRollup` table to hold the
    aggregates yet). When that decision lands: add a `ScanRollup(event, attempts,
    accepted, rolled_up_at)` model to this app, upsert the rows below into it and
    delete the raw records it covers, all inside one transaction. Until then this
    job is a dry run and `deleted` is always 0 — a job that deleted a year of
    door evidence on an unrecorded assumption is worse than one that waits.
    """
    now = now or timezone.now()
    cutoff = now - timedelta(days=SCAN_ROLLUP_AFTER_DAYS)
    rows = (
        ScanRecord.objects.filter(scanned_at__lt=cutoff)
        .values("event_id")
        .annotate(attempts=Count("id"), accepted=Count("id", filter=Q(result__in=ACCEPTING)))
        .order_by("event_id")
    )
    per_event = [
        {"event_id": str(r["event_id"]), "attempts": r["attempts"], "accepted": r["accepted"]}
        for r in rows
    ]
    total = sum(r["attempts"] for r in per_event)
    log.info(
        "rollup-scans: %d scan records across %d events are older than %s; "
        "nothing deleted (retention undecided, MASTER_SPEC §11)",
        total, len(per_event), cutoff.date(),
    )
    return {
        "cutoff": cutoff.isoformat(),
        "events": len(per_event),
        "scan_records": total,
        "deleted": 0,
        "per_event": per_event,
        "note": "Raw records retained: deletion waits on a recorded retention decision.",
    }


@transaction.atomic
def purge_external(*, now=None):
    """
    MASTER_SPEC §8.3: external participant details are genuinely deleted once
    `purge_after` has passed. Rows with no `purge_after` are kept: the retention
    period is undecided (§11 #8) and a null means "no decision", not "never".

    Decision E-09 (QA wave 1, F1): the ExternalParticipant ROW and its
    Registration rows stay; only the personal fields are blanked. Deleting the
    row cascaded into Registration and rewrote an already-reported semester's
    figures (`external_participants`, `by_club`), which the Registration docstring
    forbids ("never deleted"). The personal data — name, institution, email,
    phone — is what §8.3 wants gone, and it goes. `purged_at` marks the row so a
    re-run never counts it twice; the FK is PROTECT, so an accidental delete
    fails loudly instead of taking the attendance with it.

    One UPDATE inside one transaction; `purged` is the statement's own row count,
    so two schedulers firing at once cannot both claim the same rows.
    """
    now = now or timezone.now()
    today = now.date()
    purged = ExternalParticipant.objects.filter(
        purge_after__lt=today, purged_at__isnull=True,
    ).update(full_name="", institution="", email="", phone="", purged_at=now)
    log.info("purge-external: blanked %d external participants (rows and registrations kept)", purged)
    return {"purged": purged, "registrations_removed": 0, "as_of": today.isoformat()}


def flag_dormant(*, now=None):
    """
    B-05 (W2) owns the rule — `Club.last_activity_at` against `DORMANCY_DAYS` —
    and exposes it as `clubs.services.flag_dormant`. This job only schedules it.
    """
    try:
        # TODO(orchestrator, B-05): provided by W2's clubs/services.py; wire at merge.
        from clubs.services import flag_dormant as _flag_dormant
    except ImportError as exc:
        raise JobNotWired("flag-dormant", "clubs.services.flag_dormant") from exc
    return _normalise(_flag_dormant(), key="flagged")


def escalate_sla(*, now=None):
    """
    B-07 (W3) owns the rule — queue items older than `APPROVAL_SLA_HOURS` at
    their current gate — and exposes it as `governance.services.escalated_requests`.
    This job tells the people who can clear the gate, once per breach.

    Recipients per item (QA F5): holders of the stage's role, active delegates
    for that stage (B-06), and the Dean as the escalation target. Dedup key
    (QA F2) is the request AND the stage, carried in the notification link: a
    request that breaches again after the clock restarts at the next gate, or a
    resubmitted event with a fresh request, is a fresh breach and is notified
    again; the same breach seen by the next hourly run is not.

    One bad row must not sink the run (QA F4): each item is isolated, logged and
    counted under `failed`; the subject is cut to the column width.
    In-app and email only, through the notifier adapter (AGENT_PROMPT §2).
    """
    try:
        # TODO(orchestrator, B-07): provided by W3's governance/services.py; wire at merge.
        from governance.services import _stage_role, active_delegations, escalated_requests
    except ImportError as exc:
        raise JobNotWired("escalate-sla", "governance.services.escalated_requests") from exc
    from governance.models import Notification
    from identity.models import User
    from reporting.services import escalation_summary

    subject_width = Notification._meta.get_field("subject").max_length
    deans = list(User.objects.with_global_role(R.DEAN))
    escalated = sent = failed = 0
    for raw in escalated_requests():
        escalated += 1  # what the dependency reported; `failed` is the subset not notified
        try:
            item = escalation_summary(raw)
            recipients = _escalation_recipients(item["stage"], deans, _stage_role, active_delegations)
            link = (f"/staff/approvals/{item['event_id'] or item['id']}"
                    f"?request={item['id']}&stage={item['stage']}")
            waited = f"{item['age_hours']} h" if item["age_hours"] is not None else "longer than the SLA"
            subject = _fit(f"Approval overdue: “{item['event_title']}” ({item['club']})", subject_width)
            body = (f"“{item['event_title']}” by {item['club']} has waited {waited} at the "
                    f"{item['stage']} stage, past the approval SLA.")
            for user in recipients:
                if Notification.objects.filter(user=user, kind=ESCALATION_KIND, link=link).exists():
                    continue
                notifier().send(recipient=user, subject=subject, body=body,
                                kind=ESCALATION_KIND, link=link)
                sent += 1
        except Exception:  # noqa: BLE001 — isolate the row, keep the run
            failed += 1
            log.exception("escalate-sla: could not notify for request %s", getattr(raw, "pk", "?"))
    return {"escalated": escalated, "dean_recipients": len(deans),
            "notifications_sent": sent, "failed": failed}


def _escalation_recipients(stage, deans, stage_role, active_delegations):
    """Stage holders ∪ active delegates for the stage ∪ the Dean, each once."""
    from identity.models import User

    recipients = {user.pk: user for user in deans}
    try:
        role = stage_role(stage)
    except KeyError:
        role = None
    if role:
        for user in User.objects.with_global_role(role):
            recipients[user.pk] = user
    for delegation in active_delegations(stage=stage).select_related("delegate_user"):
        recipients[delegation.delegate_user.pk] = delegation.delegate_user
    return list(recipients.values())


def _fit(text, width):
    """Cut to a column width, marking the cut; a DataError on one row is a 500 for the run."""
    return text if len(text) <= width else text[: width - 1] + "…"


def _normalise(outcome, *, key):
    """A dependency this build has not seen may return a count, a list or a dict."""
    if isinstance(outcome, dict):
        return outcome
    if isinstance(outcome, int):
        return {key: outcome}
    items = list(outcome or [])
    return {key: len(items), "ids": [str(getattr(item, "pk", item)) for item in items]}


# ---------------------------------------------------------------------------
# The runner — the one path both front doors go through
# ---------------------------------------------------------------------------

JOBS = {
    "rollup-scans": rollup_scans,
    "purge-external": purge_external,
    "flag-dormant": flag_dormant,
    "escalate-sla": escalate_sla,
}


def run_job(name, *, actor=SYSTEM_ACTOR):
    """
    Run one job by its public name and record that it ran.

    Returns `{job, started_at, finished_at, result}`; the audit entry carries the
    same timestamps plus the result's counts (lists become their lengths).
    """
    try:
        job = JOBS[name]
    except KeyError:
        raise ProblemDetail(
            code="JOBS_UNKNOWN", title="Unknown job", status_code=404,
            detail=f"No job named {name!r}. Known jobs: {', '.join(sorted(JOBS))}.",
        ) from None
    started = timezone.now()
    result = job()
    finished = timezone.now()
    audit_sink().record(
        actor=actor,
        action=f"jobs.{name.replace('-', '_')}",
        target=Job(name),
        after={"started_at": started.isoformat(), "finished_at": finished.isoformat(),
               **_counts_only(result)},
        reason="scheduled job",
    )
    return {"job": name, "started_at": started.isoformat(),
            "finished_at": finished.isoformat(), "result": result}


def _counts_only(result):
    """The audit trail carries counts, never rows: no ids, no names (AGENT_PROMPT §7)."""
    return {
        key: (len(value) if isinstance(value, (list, tuple)) else value)
        for key, value in result.items()
        if isinstance(value, (int, float, str, list, tuple)) or value is None
    }
