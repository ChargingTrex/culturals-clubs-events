"""
QA (wave 1, W4 review — docs/qa/wave-1-w4.md): tests that expose defects.

Each is marked `expectedFailure` so the suite stays green until the fix lands;
when a fix lands the test turns into an "unexpected success", which is the
signal to remove the decorator. Finding ids refer to the QA report.
"""
from datetime import timedelta
from unittest import expectedFailure

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from common import roles as R
from events.models import EventStatus
from governance.models import ApprovalRequest, ApprovalStage, ApprovalState
from participation.models import ExternalParticipant, Registration
from reporting.services import semester_report
from tests import factories as f

TOKEN = "qa-jobs-token"
AUTH = {"HTTP_AUTHORIZATION": f"Bearer {TOKEN}"}


class PurgeKeepsReportedFiguresTests(TestCase):
    """W4-01: purging an external participant must not rewrite a reported semester."""

    @expectedFailure
    def test_a_reported_semesters_figures_survive_the_purge(self):
        from jobs.services import purge_external

        semester = f.semester()
        event = f.event(f.club(), f.venue(), days=-10, status=EventStatus.REPORTED)
        guest = ExternalParticipant.objects.create(
            full_name="Guest Person", email="guest@elsewhere.edu",
            purge_after=timezone.localdate() - timedelta(days=1))
        Registration.objects.create(event=event, external=guest, attended=True,
                                    checked_in_at=event.starts_at)
        before = semester_report(semester)
        purge_external()
        after = semester_report(semester)
        # The PII must be gone ...
        self.assertFalse(ExternalParticipant.objects.filter(full_name="Guest Person").exists())
        # ... and the figures must not move (Registration docstring: "Never deleted").
        for key in ("total_participation", "external_participants", "avg_attendance"):
            self.assertEqual(after[key], before[key], key)
        self.assertEqual([r["attendance"] for r in after["by_club"]],
                         [r["attendance"] for r in before["by_club"]])


@override_settings(JOBS_TOKEN=TOKEN, APPROVAL_SLA_HOURS=48)
class EscalationReNotifiesTests(TestCase):
    """W4-02: the dedup key is the event link, so a request that breaches the SLA
    a second time (next stage, or a fresh request after return/resubmit) is silenced."""

    def setUp(self):
        self.client = APIClient()
        f.user("dean@college.edu", global_roles=[R.DEAN], mfa=True)
        self.event = f.event(f.club(), f.venue(), title="Twice Late", days=10,
                             status=EventStatus.SUBMITTED)

    def run_job(self):
        response = self.client.get("/api/v1/jobs/escalate-sla", **AUTH)
        self.assertEqual(response.status_code, 200)
        return response.data["result"]["notifications_sent"]

    def age(self, request, hours):
        ApprovalRequest.objects.filter(pk=request.pk).update(
            stage_entered_at=timezone.now() - timedelta(hours=hours))

    @expectedFailure
    def test_a_second_breach_at_the_next_stage_is_notified_again(self):
        request = ApprovalRequest.objects.create(
            event=self.event, stages=["cultural_society", "dean"],
            current_stage=ApprovalStage.CULTURAL_SOCIETY)
        self.age(request, 80)
        self.assertEqual(self.run_job(), 1)
        # Society decides; the SLA clock restarts at the Dean gate and runs out again.
        ApprovalRequest.objects.filter(pk=request.pk).update(current_stage=ApprovalStage.DEAN)
        self.age(request, 80)
        self.assertEqual(self.run_job(), 1, "a fresh breach at a new stage deserves a fresh notice")

    @expectedFailure
    def test_a_resubmitted_event_that_breaches_again_is_notified_again(self):
        first = ApprovalRequest.objects.create(event=self.event, stages=["dean"],
                                               current_stage=ApprovalStage.DEAN)
        self.age(first, 80)
        self.assertEqual(self.run_job(), 1)
        ApprovalRequest.objects.filter(pk=first.pk).update(state=ApprovalState.RETURNED)
        second = ApprovalRequest.objects.create(event=self.event, stages=["dean"],
                                               current_stage=ApprovalStage.DEAN)
        self.age(second, 80)
        self.assertEqual(self.run_job(), 1, "a new request for the same event is a new breach")


class CsvCellsAreFormulaSafeTests(TestCase):
    """W4-06: a club name beginning with = + - @ reaches the spreadsheet as a formula."""

    @expectedFailure
    def test_a_formula_shaped_club_name_is_neutralised(self):
        f.semester()
        club = f.club("=HYPERLINK(\"http://evil.example\",\"Swara\")")
        f.event(club, f.venue(), days=-5, status=EventStatus.REPORTED)
        f.user("dean@college.edu", global_roles=[R.DEAN], mfa=True)
        client = f.as_user(APIClient(), "dean@college.edu", mfa_code="1")
        body = client.get("/api/v1/reporting/reports/semester/csv").content.decode()
        self.assertNotIn(',=HYPERLINK', body)
        self.assertNotIn('"=HYPERLINK', body)
