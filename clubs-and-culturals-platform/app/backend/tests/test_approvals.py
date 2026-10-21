"""
The approval chain, and the wrong-role tests the Definition of Done requires.

AGENT_PROMPT §7: "Permissions enforced server-side and proven with a wrong-role
token test." Every refusal below is asserted through the API with a real token,
not by calling a permission class directly — hiding a button is not a permission,
and neither is a unit test of the check in isolation.
"""
from decimal import Decimal

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from budget.models import BudgetStage
from clubs.models import Club
from common import roles as R
from events.models import EventStatus
from governance import services as governance
from governance.models import ApprovalStage, ApprovalState
from tests import factories as f


class ChainRoutingTests(TestCase):
    """How a proposal is routed, which is data rather than a chain of ifs."""

    def setUp(self):
        self.venue = f.venue()
        self.cultural = f.club("Swara", category=Club.Category.CULTURAL)
        self.technical = f.club("Bitwise", category=Club.Category.TECHNICAL)

    def route_for(self, club, amount, **kw):
        event = f.event(club, self.venue, **kw)
        f.budget(event, amounts=(amount,))
        stages, reason = governance.build_route(event, Decimal(amount))
        return stages, reason

    def test_cultural_club_routes_through_the_society_then_the_dean(self):
        stages, _ = self.route_for(self.cultural, 10000)
        self.assertEqual(stages, [ApprovalStage.CULTURAL_SOCIETY, ApprovalStage.DEAN])

    def test_technical_club_skips_the_society(self):
        """A technical club's event should not queue behind the cultural secretary."""
        stages, _ = self.route_for(self.technical, 10000)
        self.assertEqual(stages, [ApprovalStage.DEAN])

    def test_above_threshold_adds_the_vice_chancellor(self):
        stages, reason = self.route_for(self.cultural, 60000)
        self.assertEqual(stages[-1], ApprovalStage.VC)
        self.assertIn("over", reason)

    def test_a_fest_takes_the_vc_gate_whatever_the_amount(self):
        """AGENT_PROMPT §2: fests take two gates regardless of budget."""
        from events.models import Fest

        fest = Fest.objects.create(name="Spring Fest", club=self.cultural,
                                   starts_on=f.timezone.localdate(),
                                   ends_on=f.timezone.localdate())
        stages, reason = self.route_for(self.cultural, 1000, fest=fest)
        self.assertEqual(stages[-1], ApprovalStage.VC)
        self.assertIn("fest", reason)

    @override_settings(APPROVAL_CHAIN=["dean"])
    def test_society_gate_switches_off_in_configuration(self):
        """
        The documented chain (AGENT_PROMPT §2) is Dean-only. The Cultural Society
        gate is an addition, and turning it off must not need a code change.
        """
        stages, _ = self.route_for(self.cultural, 10000)
        self.assertEqual(stages, [ApprovalStage.DEAN])

    @override_settings(APPROVAL_CHAIN=["cultural_society"])
    def test_the_dean_gate_cannot_be_configured_away(self):
        """Misconfiguration must not publish events with nobody accountable."""
        stages, _ = self.route_for(self.cultural, 10000)
        self.assertIn(ApprovalStage.DEAN, stages)


class ApprovalFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        f.semester()
        self.venue = f.venue()
        self.club = f.club("Swara")
        self.president = f.student("pres@college.edu", prn="23CS1001", name="Arjun P")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        self.treasurer = f.student("treas@college.edu", prn="23CS1002", name="Divya T")
        f.member(self.club, self.treasurer, R.CLUB_TREASURER)
        self.plain = f.student("member@college.edu", prn="23CS1003", name="Rohan M")
        f.member(self.club, self.plain, R.CLUB_MEMBER)
        self.outsider = f.student("outsider@college.edu", prn="23CS1004")

        self.dean = f.user("dean@college.edu", name="Dean", global_roles=[R.DEAN], mfa=True)
        self.vc = f.user("vc@college.edu", name="VC", global_roles=[R.VICE_CHANCELLOR], mfa=True)
        self.society = f.user("society@college.edu", name="Society",
                              global_roles=[R.CULTURAL_SOCIETY], mfa=True)

        self.event = f.event(self.club, self.venue, title="Swara Unplugged")
        f.budget(self.event, amounts=(10000, 5000))
        self.approval = governance.submit(self.event, actor=f.ctx_for(self.president.user),
                                          actor_user=self.president.user)

    def decide(self, email, decision, **body):
        f.as_user(self.client, email, mfa_code="123456")
        return self.client.post(f"/api/v1/governance/approvals/{self.approval.id}/decide",
                                {"decision": decision, **body}, format="json")

    # ---- the happy path ------------------------------------------------
    def test_society_then_dean_publishes_the_event(self):
        self.assertEqual(self.approval.current_stage, ApprovalStage.CULTURAL_SOCIETY)
        self.assertEqual(self.decide("society@college.edu", "approve").status_code, 200)
        self.approval.refresh_from_db()
        self.assertEqual(self.approval.current_stage, ApprovalStage.DEAN)

        self.assertEqual(self.decide("dean@college.edu", "approve").status_code, 200)
        self.approval.refresh_from_db()
        self.event.refresh_from_db()
        self.assertEqual(self.approval.state, ApprovalState.APPROVED)
        self.assertEqual(self.event.status, EventStatus.PUBLISHED,
                         "an approved event is published in the same transaction")
        self.assertEqual(self.event.budget.stage, BudgetStage.SANCTIONED)

    # ---- wrong-role tests ----------------------------------------------
    def test_the_dean_cannot_act_while_it_is_with_the_society(self):
        response = self.decide("dean@college.edu", "approve")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "GOVERNANCE_WRONG_STAGE")

    def test_a_student_cannot_decide(self):
        response = self.decide("outsider@college.edu", "approve")
        self.assertEqual(response.status_code, 404,
                         "an unrelated student should not even see the request")

    def test_the_club_president_cannot_approve_their_own_proposal(self):
        """AGENT_PROMPT §6: no club role approves its own budget."""
        self.president.user.global_roles = [R.STUDENT, R.CULTURAL_SOCIETY]
        self.president.user.save()
        response = self.decide("pres@college.edu", "approve")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "GOVERNANCE_SELF_APPROVAL")

    def test_the_vc_is_not_an_approver_at_all_below_the_threshold(self):
        """
        This proposal is under the escalation threshold, so the VC gate is not on
        its route. That is a permission refusal, not a turn-taking one.
        """
        response = self.decide("vc@college.edu", "approve")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "GOVERNANCE_NOT_APPROVER")

    def test_an_approver_later_on_the_route_is_told_it_is_not_their_turn_yet(self):
        """
        Above the threshold the VC *is* on the route, just not yet. A bare 403 there
        reads like a broken permission; 409 says what is actually happening.
        """
        big = f.event(self.club, f.venue("Open Air Theatre", 1000), title="Culturals Night",
                      days=30, expected=700)
        f.budget(big, amounts=(80000,))
        approval = governance.submit(big, actor=f.ctx_for(self.president.user))
        self.assertIn(ApprovalStage.VC, approval.stages)

        f.as_user(self.client, "vc@college.edu", mfa_code="123456")
        response = self.client.post(f"/api/v1/governance/approvals/{approval.id}/decide",
                                    {"decision": "approve"}, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "GOVERNANCE_WRONG_STAGE")
        self.assertIn("Cultural Society", response.data["detail"])

    # ---- decision quality ----------------------------------------------
    def test_returning_without_a_comment_is_refused(self):
        response = self.decide("society@college.edu", "return")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data["code"], "GOVERNANCE_COMMENT_REQUIRED")
        self.assertEqual(response.data["errors"][0]["field"], "comment")

    def test_returning_lets_the_club_revise_and_resubmit(self):
        self.decide("society@college.edu", "return", comment="Trim the sound budget.")
        self.event.refresh_from_db()
        self.assertEqual(self.event.status, EventStatus.RETURNED)
        f.as_user(self.client, "pres@college.edu")
        again = self.client.post(f"/api/v1/events/{self.event.id}/submit", {}, format="json")
        self.assertEqual(again.status_code, 200)

    def test_rejecting_is_terminal(self):
        self.decide("society@college.edu", "reject", comment="Not this semester.")
        self.event.refresh_from_db()
        self.assertEqual(self.event.status, EventStatus.REJECTED)
        f.as_user(self.client, "pres@college.edu")
        again = self.client.post(f"/api/v1/events/{self.event.id}/submit", {}, format="json")
        self.assertEqual(again.status_code, 409)

    def test_a_second_pending_request_per_event_is_impossible(self):
        with self.assertRaises(Exception):
            governance.submit(self.event, actor=f.ctx_for(self.president.user))

    # ---- sanctioning ---------------------------------------------------
    def test_the_dean_may_reduce_a_head_but_not_raise_it(self):
        self.decide("society@college.edu", "approve")
        line = self.event.budget.lines.first()
        response = self.decide("dean@college.edu", "approve",
                               sanctioned={str(line.id): "99999"})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data["code"], "BUDGET_SANCTION_EXCEEDS_REQUEST")

    def test_untouched_heads_are_sanctioned_as_requested(self):
        """A null sanction after a decision would read as 'not yet decided'."""
        self.decide("society@college.edu", "approve")
        first, second = self.event.budget.lines.all()
        self.decide("dean@college.edu", "approve", sanctioned={str(first.id): "8000"})
        first.refresh_from_db(); second.refresh_from_db()
        self.assertEqual(first.amount_sanctioned, Decimal("8000.00"))
        self.assertEqual(second.amount_sanctioned, second.amount_requested)

    # ---- queue scoping -------------------------------------------------
    def test_each_approver_sees_only_their_own_stage(self):
        f.as_user(self.client, "society@college.edu", mfa_code="1")
        society_queue = self.client.get("/api/v1/governance/approvals/queue").data
        self.assertEqual(society_queue["count"], 1)
        self.assertEqual(society_queue["stages_you_hold"], ["cultural_society"])

        f.as_user(self.client, "dean@college.edu", mfa_code="1")
        dean_queue = self.client.get("/api/v1/governance/approvals/queue").data
        self.assertEqual(dean_queue["count"], 0,
                         "the Dean's queue is empty while the Society still holds it")

    def test_a_plain_member_sees_no_approval_queue(self):
        f.as_user(self.client, "member@college.edu")
        queue = self.client.get("/api/v1/governance/approvals/queue").data
        self.assertEqual(queue["count"], 0)
        self.assertEqual(queue["stages_you_hold"], [])


class MfaOnHighValueTests(TestCase):
    """§5.5: sanctioning above the threshold needs MFA regardless of role."""

    def setUp(self):
        self.client = APIClient()
        f.semester()
        self.club = f.club("Swara")
        self.president = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        self.event = f.event(self.club, f.venue("Open Air Theatre", 1000), expected=700)
        f.budget(self.event, amounts=(80000,))
        self.approval = governance.submit(
            self.event, actor=f.ctx_for(self.president.user))
        f.user("society@college.edu", global_roles=[R.CULTURAL_SOCIETY], mfa=True)

    def test_approving_an_above_threshold_budget_without_mfa_is_refused(self):
        society = f.User.objects.get(email="society@college.edu")
        no_mfa = f.ctx_for(society, mfa=False)
        with self.assertRaises(Exception) as caught:
            governance.decide(self.approval, ctx=no_mfa, decision="approve")
        self.assertEqual(getattr(caught.exception, "code", ""), "GOVERNANCE_MFA_REQUIRED")
