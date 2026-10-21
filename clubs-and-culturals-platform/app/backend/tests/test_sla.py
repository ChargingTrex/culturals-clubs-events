"""
Approval SLA: age at the current gate, and escalation past APPROVAL_SLA_HOURS
(PRD §5.11, §6.3).

The clock measures the gate that is holding the request, not the whole
journey, so it restarts whenever the request advances.
"""
from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from common import roles as R
from governance import services as governance
from governance.models import ApprovalStage
from tests import factories as f


@override_settings(APPROVAL_SLA_HOURS=48)
class ApprovalSlaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        f.semester()
        self.venue = f.venue()
        self.club = f.club("Swara")
        self.president = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        f.user("society@college.edu", name="Society", global_roles=[R.CULTURAL_SOCIETY],
               mfa=True)
        f.user("dean@college.edu", name="Dean", global_roles=[R.DEAN], mfa=True)

        self.fresh_event = f.event(self.club, self.venue, title="Fresh", days=5)
        f.budget(self.fresh_event, amounts=(1000,))
        self.fresh = governance.submit(self.fresh_event, actor=f.ctx_for(self.president.user))

        self.old_event = f.event(self.club, self.venue, title="Stale", days=9)
        f.budget(self.old_event, amounts=(2000,))
        self.old = governance.submit(self.old_event, actor=f.ctx_for(self.president.user))
        self.old.stage_entered_at = timezone.now() - timedelta(hours=49)
        self.old.save(update_fields=["stage_entered_at"])

    def queue(self, email="society@college.edu", **params):
        f.as_user(self.client, email, mfa_code="1")
        return self.client.get("/api/v1/governance/approvals/queue", params).data

    def by_title(self, queue):
        return {item["event_title"]: item for item in queue["results"]}

    def test_a_fresh_request_is_not_escalated(self):
        item = self.by_title(self.queue())["Fresh"]
        self.assertFalse(item["escalated"])
        self.assertLess(item["age_hours"], 1)

    def test_a_request_older_than_the_sla_is_escalated(self):
        item = self.by_title(self.queue())["Stale"]
        self.assertTrue(item["escalated"])
        self.assertGreaterEqual(item["age_hours"], 49)
        self.assertLess(item["age_hours"], 50)

    def test_the_queue_lists_the_oldest_first_and_names_the_sla(self):
        queue = self.queue()
        self.assertEqual([i["event_title"] for i in queue["results"]], ["Stale", "Fresh"],
                         "oldest at the current gate first, not soonest event first")
        self.assertEqual(queue["sla_hours"], 48)

    def test_the_escalated_filter_keeps_only_requests_past_the_sla(self):
        queue = self.queue(escalated="true")
        self.assertEqual(queue["count"], 1)
        self.assertTrue(queue["escalated_only"])
        self.assertEqual(queue["results"][0]["event_title"], "Stale")
        self.assertEqual(self.queue()["count"], 2, "without the filter both are listed")

    def test_the_sla_is_configuration(self):
        with override_settings(APPROVAL_SLA_HOURS=72):
            self.assertFalse(self.by_title(self.queue())["Stale"]["escalated"])
        with override_settings(APPROVAL_SLA_HOURS=0):
            self.assertTrue(self.by_title(self.queue())["Fresh"]["escalated"])

    def test_age_resets_when_the_stage_advances(self):
        f.as_user(self.client, "society@college.edu", mfa_code="1")
        response = self.client.post(f"/api/v1/governance/approvals/{self.old.id}/decide",
                                    {"decision": "approve"}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.old.refresh_from_db()
        self.assertEqual(self.old.current_stage, ApprovalStage.DEAN)
        self.assertLess(self.old.age_hours, 1)
        self.assertFalse(self.old.escalated)

        item = self.by_title(self.queue("dean@college.edu"))["Stale"]
        self.assertFalse(item["escalated"], "the Dean's clock starts when it reaches the Dean")

    def test_a_resolved_request_is_never_escalated(self):
        f.as_user(self.client, "society@college.edu", mfa_code="1")
        self.client.post(f"/api/v1/governance/approvals/{self.old.id}/decide",
                         {"decision": "reject", "comment": "Not this semester."}, format="json")
        self.old.refresh_from_db()
        self.old.stage_entered_at = timezone.now() - timedelta(hours=200)
        self.old.save(update_fields=["stage_entered_at"])
        self.assertFalse(self.old.escalated)

    def test_escalated_requests_is_exposed_for_the_overview_and_the_job(self):
        escalated = list(governance.escalated_requests())
        self.assertEqual([r.pk for r in escalated], [self.old.pk])
        with override_settings(APPROVAL_SLA_HOURS=0):
            self.assertEqual(governance.escalated_requests().count(), 2)
