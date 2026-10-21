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
from governance.models import ApprovalRequest, ApprovalStage, AuditEntry, Delegation, Notification
from participation.models import ExternalParticipant, Registration, ScanRecord, ScanResult
from tests import factories as f

TOKEN = "test-jobs-token-not-a-user-32-chars-min"  # QA F8: < 32 chars is 503
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

    @override_settings(JOBS_TOKEN="short-01")
    def test_a_token_shorter_than_32_characters_is_treated_as_disabled(self):
        """QA F8: an unauthenticated, unthrottled route needs a real secret."""
        response = self.client.post("/api/v1/jobs/purge-external", HTTP_AUTHORIZATION="Bearer short-01")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["code"], "JOBS_DISABLED")
        self.assertIn("32", response.data["detail"])

    def test_a_refused_attempt_is_logged(self):
        with self.assertLogs("jobs.views", level="WARNING") as logs:
            self.client.post("/api/v1/jobs/purge-external", HTTP_AUTHORIZATION="Bearer nope")
        self.assertIn("refused trigger of 'purge-external'", logs.output[0])

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

    def test_only_expired_rows_are_blanked_and_no_row_is_deleted(self):
        """Decision E-09: the row stays, the personal data goes."""
        response = self.client.post("/api/v1/jobs/purge-external", **AUTH)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["result"]["purged"], 1)
        self.assertEqual(ExternalParticipant.objects.count(), 4, "no row is deleted")
        self.expired.refresh_from_db()
        self.assertEqual((self.expired.full_name, self.expired.institution,
                          self.expired.email, self.expired.phone), ("", "", "", ""))
        self.assertIsNotNone(self.expired.purged_at)
        for survivor in (self.kept, self.undecided, self.due_today):
            survivor.refresh_from_db()
            self.assertTrue(survivor.full_name, survivor.pk)

    def test_a_second_run_does_not_count_the_same_row_again(self):
        self.client.post("/api/v1/jobs/purge-external", **AUTH)
        again = self.client.post("/api/v1/jobs/purge-external", **AUTH).data
        self.assertEqual(again["result"]["purged"], 0)

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

    def test_the_registration_survives_and_the_semester_figure_is_unchanged(self):
        """QA F1 / decision E-09: a purge must not rewrite a reported semester."""
        from reporting.services import semester_report

        semester = f.semester()
        event = f.event(f.club(), f.venue(), days=-5, status=EventStatus.REPORTED)
        registration = Registration.objects.create(event=event, external=self.expired, attended=True,
                                                   checked_in_at=event.starts_at)
        before = semester_report(semester)
        data = self.client.post("/api/v1/jobs/purge-external", **AUTH).data
        after = semester_report(semester)
        self.assertEqual(data["result"]["registrations_removed"], 0)
        registration.refresh_from_db()
        self.assertTrue(registration.attended)
        self.assertEqual(registration.external_id, self.expired.pk)
        self.assertEqual(after["external_participants"], before["external_participants"])
        self.assertEqual(after["external_participants"], 1)
        self.assertEqual(after["total_participation"], before["total_participation"])


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
                         {"escalated": 1, "dean_recipients": 2, "notifications_sent": 2, "failed": 0})
        self.assertEqual(second.data["result"]["notifications_sent"], 0, "no re-nagging")
        notes = Notification.objects.filter(kind="approval.escalated")
        self.assertEqual(notes.count(), 2)
        self.assertEqual({n.user for n in notes}, {self.dean, self.other_dean})
        note = notes.get(user=self.dean)
        self.assertIn("Late Night", note.subject)
        self.assertEqual(note.link, f"/staff/approvals/{event.id}?request={request.id}&stage=dean")
        self.assertIn("80.0 h", note.body)

    def _stale_request(self, title="Stuck", stage=ApprovalStage.DEAN, stages=("dean",)):
        event = f.event(self.club, f.venue(f"V {title}"), title=title, days=10,
                        status=EventStatus.SUBMITTED)
        request = ApprovalRequest.objects.create(event=event, stages=list(stages), current_stage=stage)
        ApprovalRequest.objects.filter(pk=request.pk).update(
            stage_entered_at=timezone.now() - timedelta(hours=80))
        request.refresh_from_db()
        return request

    def test_an_active_delegate_for_the_stage_is_told_and_an_expired_one_is_not(self):
        """QA F5: the person who can actually clear the gate hears about it."""
        active = f.user("deputy@college.edu", global_roles=[R.CULTURAL_SOCIETY], mfa=True)
        expired = f.user("former@college.edu", global_roles=[R.CULTURAL_SOCIETY], mfa=True)
        now = timezone.now()
        Delegation.objects.create(stage=ApprovalStage.DEAN, principal_user=self.dean,
                                  delegate_user=active, starts_at=now - timedelta(hours=1),
                                  ends_at=now + timedelta(days=2))
        Delegation.objects.create(stage=ApprovalStage.DEAN, principal_user=self.dean,
                                  delegate_user=expired, starts_at=now - timedelta(days=5),
                                  ends_at=now - timedelta(days=1))
        request = self._stale_request()
        with wired("governance.services", "escalated_requests", lambda: [request]):
            data = self.client.post("/api/v1/jobs/escalate-sla", **AUTH).data
        self.assertEqual(data["result"]["notifications_sent"], 3)
        told = {n.user.email for n in Notification.objects.filter(kind="approval.escalated")}
        self.assertEqual(told, {"dean@college.edu", "dean2@college.edu", "deputy@college.edu"})

    def test_a_breach_at_the_society_stage_reaches_the_society_and_the_dean(self):
        society = f.user("society@college.edu", global_roles=[R.CULTURAL_SOCIETY], mfa=True)
        request = self._stale_request(stage=ApprovalStage.CULTURAL_SOCIETY,
                                      stages=("cultural_society", "dean"))
        with wired("governance.services", "escalated_requests", lambda: [request]):
            data = self.client.post("/api/v1/jobs/escalate-sla", **AUTH).data
        self.assertEqual(data["result"]["notifications_sent"], 3)
        self.assertTrue(Notification.objects.filter(user=society, kind="approval.escalated").exists())

    def test_a_long_title_fits_the_subject_column(self):
        """QA F4: on Postgres an over-long subject is a DataError for the whole run."""
        request = self._stale_request(title="L" * 200)
        with wired("governance.services", "escalated_requests", lambda: [request]):
            data = self.client.post("/api/v1/jobs/escalate-sla", **AUTH).data
        self.assertEqual(data["result"]["failed"], 0)
        width = Notification._meta.get_field("subject").max_length
        for note in Notification.objects.filter(kind="approval.escalated"):
            self.assertLessEqual(len(note.subject), width)
            self.assertTrue(note.subject.endswith("…"))

    def test_one_bad_row_does_not_abort_the_run(self):
        """QA F4: the row is logged and counted; the others are still notified."""
        class Broken:
            @property
            def event(self):
                raise RuntimeError("row cannot be read")

        good = self._stale_request(title="Fine")
        with wired("governance.services", "escalated_requests", lambda: [Broken(), good]), \
                self.assertLogs("jobs.services", level="ERROR"):
            data = self.client.post("/api/v1/jobs/escalate-sla", **AUTH).data
        self.assertEqual(data["result"]["failed"], 1)
        self.assertEqual(data["result"]["notifications_sent"], 2)
        self.assertEqual(data["result"]["escalated"], 2)

    def test_escalate_sla_accepts_dict_rows_too(self):
        """The dependency's row shape is unknown; a dict must work as well as a model."""
        row = {"id": "abc", "event_id": "evt-1", "event_title": "Dict Event",
               "club": "Swara", "stage": "dean", "age_hours": 50}
        with wired("governance.services", "escalated_requests", lambda: [row]):
            response = self.client.post("/api/v1/jobs/escalate-sla", **AUTH)
        self.assertEqual(response.data["result"]["notifications_sent"], 2)
        self.assertEqual(Notification.objects.filter(
            link="/staff/approvals/evt-1?request=abc&stage=dean").count(), 2)


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
