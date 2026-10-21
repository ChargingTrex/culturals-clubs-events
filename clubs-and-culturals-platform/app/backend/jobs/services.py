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


def purge_external(*, now=None):
    """
    MASTER_SPEC §8.3: external participant details are genuinely deleted once
    `purge_after` has passed. Rows with no `purge_after` are kept: the retention
    period is undecided (§11 #8) and a null means "no decision", not "never".

    NOTE for the orchestrator: `Registration.external` is `on_delete=CASCADE`
    (participation/models.py), so purging a participant also removes their
    registration rows, and the `external_participants` figure of an already
    reported semester drops with them. The number of cascaded registrations is
    returned so the effect is never silent. Keeping the attendance row and
    blanking the personal fields instead needs a change in participation
    (not owned here) — flagged, not done.
    """
    today = (now or timezone.now()).date()
    due = ExternalParticipant.objects.filter(purge_after__lt=today)
    count = due.count()
    _, by_model = due.delete()
    registrations = by_model.get("participation.Registration", 0)
    log.info("purge-external: purged %d external participants (%d registrations cascaded)",
             count, registrations)
    return {"purged": count, "registrations_removed": registrations, "as_of": today.isoformat()}


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
    B-07 (W3) owns the rule — queue items older than `APPROVAL_SLA_HOURS` — and
    exposes it as `governance.services.escalated_requests`. This job tells the
    Dean about each one, once: a cron that re-notifies every hour is noise, so a
    request the Dean has already been told about is skipped.

    In-app and email only, through the notifier adapter (AGENT_PROMPT §2).
    """
    try:
        # TODO(orchestrator, B-07): provided by W3's governance/services.py; wire at merge.
        from governance.services import escalated_requests
    except ImportError as exc:
        raise JobNotWired("escalate-sla", "governance.services.escalated_requests") from exc
    from governance.models import Notification
    from identity.models import User
    from reporting.services import escalation_summary

    deans = list(User.objects.with_global_role(R.DEAN))
    escalated = [escalation_summary(item) for item in escalated_requests()]
    sent = 0
    for item in escalated:
        link = f"/staff/approvals/{item['event_id'] or item['id']}"
        waited = f"{item['age_hours']} h" if item["age_hours"] is not None else "longer than the SLA"
        subject = f"Approval overdue: “{item['event_title']}” ({item['club']})"
        body = (f"“{item['event_title']}” by {item['club']} has waited {waited} at the "
                f"{item['stage']} stage, past the approval SLA.")
        for dean in deans:
            if Notification.objects.filter(user=dean, kind=ESCALATION_KIND, link=link).exists():
                continue
            notifier().send(recipient=dean, subject=subject, body=body,
                            kind=ESCALATION_KIND, link=link)
            sent += 1
    return {"escalated": len(escalated), "dean_recipients": len(deans), "notifications_sent": sent}


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
