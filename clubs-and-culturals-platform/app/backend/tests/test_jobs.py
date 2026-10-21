"""
Scheduled jobs (checklist B-10a).

The jobs are reachable as Celery tasks and as token-guarded HTTP triggers for
Vercel Cron (docs/COMPLETION_PLAN.md §2). The token is a shared secret, not a
user: a Dean's real bearer token must be refused like any other wrong token.

Two jobs depend on functions other workers deliver (clubs.services.flag_dormant,
governance.services.escalated_requests). The tests here force both outcomes —
present and absent — so they pass before and after the orchestrator wires them.
"""
import importlib
import json
import sys
import types
from datetime import timedelta
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from common import roles as R
from events.models import EventStatus
from governance.models import ApprovalRequest, ApprovalStage, AuditEntry, Notification
from participation.models import ExternalParticipant, Registration, ScanRecord, ScanResult
from tests import factories as f

TOKEN = "test-jobs-token-not-a-user"
AUTH = {"HTTP_AUTHORIZATION": f"Bearer {TOKEN}"}


def unwired(module_name):
    """Make `from <module> import x` raise ImportError, whatever the merged tree holds."""
    return mock.patch.dict(sys.modules, {module_name: None})


def wired(module_name, attr, value):
    """Provide `<module>.<attr>`, whether or not the module exists in this tree."""
    try:
        importlib.import_module(module_name)
    except ImportError:
        module = types.ModuleType(module_name)
        setattr(module, attr, value)
        return mock.patch.dict(sys.modules, {module_name: module})
    return mock.patch(f"{module_name}.{attr}", create=True, new=value)


@override_settings(JOBS_TOKEN=TOKEN)
class JobTokenTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_no_token_is_401(self):
        response = self.client.post("/api/v1/jobs/purge-external")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["code"], "JOBS_UNAUTHORIZED")

    def test_wrong_token_is_401(self):
        response = self.client.post("/api/v1/jobs/purge-external",
                                    HTTP_AUTHORIZATION="Bearer not-the-token")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["code"], "JOBS_UNAUTHORIZED")

    def test_a_deans_api_token_is_not_a_job_token(self):
        """Wrong-role check: the most privileged user token still cannot run jobs."""
        f.user("dean@college.edu", global_roles=[R.DEAN], mfa=True)
        f.as_user(self.client, "dean@college.edu", mfa_code="1")
        response = self.client.post("/api/v1/jobs/purge-external")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["code"], "JOBS_UNAUTHORIZED")

    @override_settings(JOBS_TOKEN="")
    def test_an_empty_setting_disables_the_triggers_with_503(self):
        response = self.client.post("/api/v1/jobs/purge-external", **AUTH)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["code"], "JOBS_DISABLED")
        self.assertFalse(AuditEntry.objects.exists())

    def test_an_unknown_job_is_404_after_the_token_check(self):
        self.assertEqual(self.client.post("/api/v1/jobs/make-coffee").status_code, 401)
        response = self.client.post("/api/v1/jobs/make-coffee", **AUTH)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["code"], "JOBS_UNKNOWN")

    def test_get_is_accepted_because_vercel_cron_only_issues_get(self):
        self.assertEqual(self.client.get("/api/v1/jobs/purge-external").status_code, 401)
        response = self.client.get("/api/v1/jobs/purge-external", **AUTH)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["job"], "purge-external")


@override_settings(JOBS_TOKEN=TOKEN)
class PurgeExternalTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        today = timezone.localdate()
        self.expired = ExternalParticipant.objects.create(
            full_name="Old Guest", email="old@elsewhere.edu", purge_after=today - timedelta(days=1))
        self.kept = ExternalParticipant.objects.create(
            full_name="Recent Guest", purge_after=today + timedelta(days=30))
        self.undecided = ExternalParticipant.objects.create(full_name="Undated Guest")
        self.due_today = ExternalParticipant.objects.create(
            full_name="Today Guest", purge_after=today)

    def test_only_expired_rows_are_removed(self):
        response = self.client.post("/api/v1/jobs/purge-external", **AUTH)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["result"]["purged"], 1)
        self.assertFalse(ExternalParticipant.objects.filter(pk=self.expired.pk).exists())
        for survivor in (self.kept, self.undecided, self.due_today):
            self.assertTrue(ExternalParticipant.objects.filter(pk=survivor.pk).exists(),
                            survivor.full_name)

    def test_the_run_is_audited_with_the_count_only(self):
        self.client.post("/api/v1/jobs/purge-external", **AUTH)
        entry = AuditEntry.objects.get(action="jobs.purge_external")
        self.assertEqual(entry.target_type, "Job")
        self.assertEqual(entry.target_id, "purge-external")
        self.assertEqual(entry.after["purged"], 1)
        self.assertNotIn("Old Guest", json.dumps(entry.after))
        self.assertNotIn("old@elsewhere.edu", json.dumps(entry.after))

    def test_the_response_shape(self):
        data = self.client.post("/api/v1/jobs/purge-external", **AUTH).data
        self.assertEqual(set(data), {"job", "started_at", "finished_at", "result"})
        self.assertLessEqual(data["started_at"], data["finished_at"])

    def test_a_cascaded_registration_is_reported_not_hidden(self):
        """Registration.external is CASCADE; the job says how many rows went with it."""
        event = f.event(f.club(), f.venue(), days=-5, status=EventStatus.REPORTED)
        Registration.objects.create(event=event, external=self.expired, attended=True,
                                    checked_in_at=event.starts_at)
        data = self.client.post("/api/v1/jobs/purge-external", **AUTH).data
        self.assertEqual(data["result"]["registrations_removed"], 1)


@override_settings(JOBS_TOKEN=TOKEN)
class RollupScansTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.club = f.club()
        self.old_event = f.event(self.club, f.venue("Old Hall"), title="Old", days=-400,
                                 status=EventStatus.REPORTED)
        self.new_event = f.event(self.club, f.venue("New Hall"), title="New", days=-5,
                                 status=EventStatus.REPORTED)
        long_ago = timezone.now() - timedelta(days=400)
        for result in (ScanResult.ACCEPTED, ScanResult.SPOT_REGISTERED, ScanResult.DUPLICATE):
            ScanRecord.objects.create(event=self.old_event, result=result,
                                      scanned_at=long_ago, synced_at=long_ago)
        ScanRecord.objects.create(event=self.new_event, result=ScanResult.ACCEPTED,
                                  scanned_at=timezone.now(), synced_at=timezone.now())

    def test_counts_cover_only_records_older_than_a_year(self):
        data = self.client.post("/api/v1/jobs/rollup-scans", **AUTH).data
        result = data["result"]
        self.assertEqual(result["events"], 1)
        self.assertEqual(result["scan_records"], 3)
        self.assertEqual(result["per_event"],
                         [{"event_id": str(self.old_event.id), "attempts": 3, "accepted": 2}])

    def test_nothing_is_deleted_until_a_retention_decision_is_recorded(self):
        data = self.client.post("/api/v1/jobs/rollup-scans", **AUTH).data
        self.assertEqual(data["result"]["deleted"], 0)
        self.assertEqual(ScanRecord.objects.count(), 4)
        entry = AuditEntry.objects.get(action="jobs.rollup_scans")
        self.assertEqual(entry.after["scan_records"], 3)
        self.assertEqual(entry.after["per_event"], 1, "the audit carries counts, not rows")


@override_settings(JOBS_TOKEN=TOKEN)
class NotWiredTests(TestCase):
    """Until B-05 and B-07 are merged, the two dependent jobs say so cleanly."""

    def setUp(self):
        self.client = APIClient()

    def test_flag_dormant_is_501_without_clubs_services(self):
        with unwired("clubs.services"):
            response = self.client.post("/api/v1/jobs/flag-dormant", **AUTH)
        self.assertEqual(response.status_code, 501)
        self.assertEqual(response.data["code"], "JOBS_NOT_WIRED")
        self.assertIn("clubs.services.flag_dormant", response.data["detail"])
        self.assertFalse(AuditEntry.objects.exists(), "nothing ran, nothing to audit")

    def test_escalate_sla_is_501_without_escalated_requests(self):
        with unwired("governance.services"):
            response = self.client.post("/api/v1/jobs/escalate-sla", **AUTH)
        self.assertEqual(response.status_code, 501)
        self.assertEqual(response.data["code"], "JOBS_NOT_WIRED")
        self.assertIn("governance.services.escalated_requests", response.data["detail"])


@override_settings(JOBS_TOKEN=TOKEN)
class WiredTests(TestCase):
    """What the two dependent jobs do once their dependency exists."""

    def setUp(self):
        self.client = APIClient()
        self.club = f.club()
        self.dean = f.user("dean@college.edu", global_roles=[R.DEAN], mfa=True)
        self.other_dean = f.user("dean2@college.edu", global_roles=[R.DEAN], mfa=True)
        f.user("vc@college.edu", global_roles=[R.VICE_CHANCELLOR], mfa=True)

    def test_flag_dormant_calls_through_and_reports_what_was_flagged(self):
        with wired("clubs.services", "flag_dormant", lambda: [self.club]):
            response = self.client.post("/api/v1/jobs/flag-dormant", **AUTH)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["result"]["flagged"], 1)
        self.assertEqual(response.data["result"]["ids"], [str(self.club.id)])
        self.assertEqual(AuditEntry.objects.get(action="jobs.flag_dormant").after["flagged"], 1)

    def test_escalate_sla_notifies_each_dean_once_per_request(self):
        event = f.event(self.club, f.venue(), title="Late Night", days=10,
                        status=EventStatus.SUBMITTED)
        request = ApprovalRequest.objects.create(event=event, stages=["dean"],
                                                 current_stage=ApprovalStage.DEAN)
        ApprovalRequest.objects.filter(pk=request.pk).update(
            created_at=timezone.now() - timedelta(hours=80),
            stage_entered_at=timezone.now() - timedelta(hours=80))
        request.refresh_from_db()

        with wired("governance.services", "escalated_requests", lambda: [request]):
            first = self.client.post("/api/v1/jobs/escalate-sla", **AUTH)
            second = self.client.post("/api/v1/jobs/escalate-sla", **AUTH)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data["result"],
                         {"escalated": 1, "dean_recipients": 2, "notifications_sent": 2})
        self.assertEqual(second.data["result"]["notifications_sent"], 0, "no re-nagging")
        notes = Notification.objects.filter(kind="approval.escalated")
        self.assertEqual(notes.count(), 2)
        self.assertEqual({n.user for n in notes}, {self.dean, self.other_dean})
        note = notes.get(user=self.dean)
        self.assertIn("Late Night", note.subject)
        self.assertEqual(note.link, f"/staff/approvals/{event.id}")
        self.assertIn("80.0 h", note.body)

    def test_escalate_sla_accepts_dict_rows_too(self):
        """The dependency's row shape is unknown; a dict must work as well as a model."""
        row = {"id": "abc", "event_id": "evt-1", "event_title": "Dict Event",
               "club": "Swara", "stage": "dean", "age_hours": 50}
        with wired("governance.services", "escalated_requests", lambda: [row]):
            response = self.client.post("/api/v1/jobs/escalate-sla", **AUTH)
        self.assertEqual(response.data["result"]["notifications_sent"], 2)
        self.assertEqual(Notification.objects.filter(link="/staff/approvals/evt-1").count(), 2)


class CeleryTaskTests(TestCase):
    """The same jobs run under a worker; the task is the runner, nothing else."""

    def test_the_task_and_the_trigger_share_one_runner(self):
        from config import celery  # noqa: F401  (configures the app from settings)
        from jobs import tasks

        ExternalParticipant.objects.create(full_name="Gone",
                                           purge_after=timezone.localdate() - timedelta(days=2))
        result = tasks.purge_external.apply().get()
        self.assertEqual(result["job"], "purge-external")
        self.assertEqual(result["result"]["purged"], 1)
        self.assertTrue(AuditEntry.objects.filter(action="jobs.purge_external").exists())

    def test_every_http_job_has_a_task(self):
        from jobs import tasks
        from jobs.services import JOBS

        for name in JOBS:
            self.assertTrue(hasattr(tasks, name.replace("-", "_")), name)
