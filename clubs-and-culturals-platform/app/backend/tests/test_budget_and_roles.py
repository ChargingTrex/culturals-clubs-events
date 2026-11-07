"""
Budget visibility and settlement, and club role assignment.

AGENT_PROMPT §6 draws two lines that are easy to get wrong and quiet when wrong:
a club member has no budget visibility, and the Treasurer cannot assign roles.
"""
from decimal import Decimal

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from budget import services as budget_services
from budget.models import BudgetStage
from clubs.models import Membership
from common import roles as R
from events.models import EventStatus
from tests import factories as f


class BudgetVisibilityTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.club = f.club("Swara")
        self.other = f.club("Lens")
        self.president = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        self.treasurer = f.student("treas@college.edu", prn="23CS1002")
        f.member(self.club, self.treasurer, R.CLUB_TREASURER)
        self.plain = f.student("member@college.edu", prn="23CS1003")
        f.member(self.club, self.plain, R.CLUB_MEMBER)
        self.rival = f.student("rival@college.edu", prn="23CS1004")
        f.member(self.other, self.rival, R.CLUB_PRESIDENT)
        f.user("dean@college.edu", global_roles=[R.DEAN], mfa=True)

        self.event = f.event(self.club, f.venue(), status=EventStatus.PUBLISHED)
        self.budget = f.budget(self.event, amounts=(10000, 6000))

    def visible_count(self, email, **kw):
        f.as_user(self.client, email, **kw)
        return self.client.get("/api/v1/budget/budgets").data["count"]

    def test_president_and_treasurer_can_see_the_budget(self):
        self.assertEqual(self.visible_count("pres@college.edu"), 1)
        self.assertEqual(self.visible_count("treas@college.edu"), 1)

    def test_a_plain_member_cannot(self):
        self.assertEqual(self.visible_count("member@college.edu"), 0)

    def test_another_club_cannot(self):
        self.assertEqual(self.visible_count("rival@college.edu"), 0)

    def test_the_dean_can_see_every_budget(self):
        self.assertEqual(self.visible_count("dean@college.edu", mfa_code="1"), 1)

    def test_fetching_another_clubs_budget_directly_is_404_not_403(self):
        """
        API_Standards §3.3: a 403 would confirm the budget exists, which for
        another club's money is itself the disclosure.
        """
        f.as_user(self.client, "rival@college.edu")
        response = self.client.get(f"/api/v1/budget/budgets/{self.budget.id}")
        self.assertEqual(response.status_code, 404)

    def test_the_event_payload_omits_budget_for_a_member(self):
        f.as_user(self.client, "member@college.edu")
        event = self.client.get(f"/api/v1/events/{self.event.id}").data
        self.assertIsNone(event["budget"])

    def test_the_event_payload_includes_budget_for_the_treasurer(self):
        f.as_user(self.client, "treas@college.edue".replace("edue", "edu"))
        event = self.client.get(f"/api/v1/events/{self.event.id}").data
        self.assertEqual(event["budget"]["total_requested"], "16000.00")


class SettlementTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.club = f.club("Swara")
        self.treasurer = f.student("treas@college.edu", prn="23CS1002")
        f.member(self.club, self.treasurer, R.CLUB_TREASURER)
        self.event = f.event(self.club, f.venue(), days=-3, status=EventStatus.REPORTED)
        self.budget = f.budget(self.event, amounts=(10000, 2000))
        for line in self.budget.lines.all():
            line.amount_sanctioned = line.amount_requested
            line.save()
        self.budget.stage = BudgetStage.SANCTIONED
        self.budget.save()

    def set_spend(self, line, amount, **extra):
        f.as_user(self.client, "treas@college.edu")
        return self.client.patch(
            f"/api/v1/budget/budgets/{self.budget.id}/lines/{line.id}",
            {"amount_spent": str(amount), **extra}, format="json")

    def settle(self):
        f.as_user(self.client, "treas@college.edu")
        return self.client.post(f"/api/v1/budget/budgets/{self.budget.id}/settle",
                                {}, format="json")

    def test_a_line_over_the_receipt_threshold_blocks_settlement(self):
        big, small = self.budget.lines.all()
        self.set_spend(big, 9000)
        self.set_spend(small, 1500)
        response = self.settle()
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data["code"], "BUDGET_SETTLEMENT_INCOMPLETE")
        codes = {e["code"] for e in response.data["errors"]}
        self.assertIn("RECEIPT_REQUIRED", codes)

    def test_all_blockers_are_reported_at_once(self):
        """
        A treasurer fixing one problem per round trip gives up and settles on paper.
        """
        big, small = self.budget.lines.all()
        self.set_spend(big, 12000)   # over sanctioned AND over receipt threshold
        response = self.settle()
        codes = {e["code"] for e in response.data["errors"]}
        self.assertIn("RECEIPT_REQUIRED", codes)
        self.assertIn("VARIANCE_NOTE_REQUIRED", codes)

    def test_an_overspend_needs_a_reason(self):
        big, small = self.budget.lines.all()
        self.set_spend(big, 11000)
        budget_services.attach_receipt(big, file_name="r.pdf", content=b"x",
                                       content_type="application/pdf")
        problems = budget_services.settlement_problems(self.budget)
        self.assertIn("VARIANCE_NOTE_REQUIRED", {p["code"] for p in problems})

        self.set_spend(big, 11000, variance_note="40 extra walk-ins needed more food")
        self.assertEqual(self.settle().status_code, 200)
        self.budget.refresh_from_db()
        self.assertEqual(self.budget.stage, BudgetStage.SETTLED)

    def test_a_plain_member_cannot_enter_spend(self):
        member = f.student("member@college.edu", prn="23CS1009")
        f.member(self.club, member, R.CLUB_MEMBER)
        line = self.budget.lines.first()
        f.as_user(self.client, "member@college.edu")
        response = self.client.patch(
            f"/api/v1/budget/budgets/{self.budget.id}/lines/{line.id}",
            {"amount_spent": "500"}, format="json")
        self.assertEqual(response.status_code, 404)

    def test_a_budget_cannot_settle_before_the_event_has_run(self):
        future = f.event(self.club, f.venue("Hall B", 120), days=10,
                         status=EventStatus.PUBLISHED, title="Later")
        budget = f.budget(future, amounts=(1000,))
        for line in budget.lines.all():
            line.amount_sanctioned = line.amount_requested
            line.amount_spent = Decimal("900")
            line.save()
        budget.stage = BudgetStage.SANCTIONED
        budget.save()
        f.as_user(self.client, "treas@college.edu")
        response = self.client.post(f"/api/v1/budget/budgets/{budget.id}/settle",
                                    {}, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "BUDGET_EVENT_NOT_RUN")


class RoleAssignmentTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.club = f.club("Swara")
        self.president = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        self.vp = f.student("vp@college.edu", prn="23CS1005")
        f.member(self.club, self.vp, R.CLUB_VICE_PRESIDENT)
        self.treasurer = f.student("treas@college.edu", prn="23CS1002")
        f.member(self.club, self.treasurer, R.CLUB_TREASURER)
        self.target = f.student("target@college.edu", prn="23CS1003")
        self.target_membership = f.member(self.club, self.target, R.CLUB_MEMBER)

    def set_role(self, email, role):
        f.as_user(self.client, email)
        return self.client.post(
            f"/api/v1/memberships/{self.target_membership.id}/role",
            {"role": role, "reason": "Reorganising the committee"}, format="json")

    def test_the_president_may_assign_a_role(self):
        self.assertEqual(self.set_role("pres@college.edu", R.CLUB_CORE).status_code, 200)
        self.target_membership.refresh_from_db()
        self.assertEqual(self.target_membership.role, R.CLUB_CORE)

    def test_the_vice_president_may_too(self):
        self.assertEqual(self.set_role("vp@college.edu", R.CLUB_CORE).status_code, 200)

    def test_the_treasurer_may_not(self):
        """
        AGENT_PROMPT §6: "Treasurer ... Cannot assign roles." The frontend also
        hides the control, but this is the restriction that actually holds.
        """
        response = self.set_role("treas@college.edu", R.CLUB_CORE)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "CLUBS_ROLE_ASSIGN_DENIED")
        self.target_membership.refresh_from_db()
        self.assertEqual(self.target_membership.role, R.CLUB_MEMBER, "nothing changed")

    def test_a_role_change_is_recorded_with_who_did_it(self):
        self.set_role("pres@college.edu", R.CLUB_SECRETARY)
        change = self.target_membership.changes.first()
        self.assertEqual(change.from_role, R.CLUB_MEMBER)
        self.assertEqual(change.to_role, R.CLUB_SECRETARY)
        self.assertEqual(str(change.actor_sub), str(self.president.user.id))

    def test_a_second_president_is_refused(self):
        """Two presidents means two people hold the role that assigns roles."""
        response = self.set_role("pres@college.edu", R.CLUB_PRESIDENT)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "CLUBS_PRESIDENT_EXISTS")

    def test_one_active_membership_per_student_per_club(self):
        from django.db import IntegrityError, transaction

        with self.assertRaises(IntegrityError), transaction.atomic():
            Membership.objects.create(club=self.club, student=self.target,
                                      role=R.CLUB_CORE)


class TreasurerBudgetRequestTests(TestCase):
    """
    The Treasurer raises budget requests.

    PRD §4 describes the role as "prepare budget requests, track sanctioned
    amounts, record actual spend", and PRD §5.19.2 and Event_Flows §9.2 both answer
    "Create and submit a proposal" with Yes. The code previously denied it, so a
    Treasurer could record spend but not raise the request — backwards.
    """

    def setUp(self):
        self.client = APIClient()
        f.semester()
        self.club = f.club("Swara")
        self.venue = f.venue("Seminar Hall A", 150)
        self.treasurer = f.student("treas@college.edu", prn="23CS1002", name="Divya T")
        f.member(self.club, self.treasurer, R.CLUB_TREASURER)
        self.member = f.student("member@college.edu", prn="23CS1003")
        f.member(self.club, self.member, R.CLUB_MEMBER)
        self.vp = f.student("vp@college.edu", prn="23CS1004")
        f.member(self.club, self.vp, R.CLUB_VICE_PRESIDENT)
        f.user("society@college.edu", global_roles=[R.CULTURAL_SOCIETY], mfa=True)
        from budget.models import BudgetTemplate, BudgetTemplateLine

        template = BudgetTemplate.objects.create(name="Performance")
        BudgetTemplateLine.objects.create(template=template, head="Sound",
                                          basis="lump_sum", rate=12000)

    def propose(self, email):
        f.as_user(self.client, email)
        starts = f.slot(days=14)
        return self.client.post("/api/v1/events", {
            "title": "Monsoon Ragas", "club": str(self.club.id), "kind": "performance",
            "venue": str(self.venue.id),
            "starts_at": starts.isoformat(),
            "ends_at": (starts + f.timedelta(hours=2)).isoformat(),
            "capacity": 150, "expected_attendance": 90,
            "budget_template": "Performance", "submit": True,
        }, format="json")

    def test_the_treasurer_can_raise_a_proposal_with_its_budget(self):
        response = self.propose("treas@college.edu")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIsNotNone(response.data["approval"])
        self.assertEqual(response.data["budget"]["stage"], "society_review")

    def test_the_treasurer_still_cannot_approve_it(self):
        """Raising a request is not sanctioning one."""
        self.propose("treas@college.edu")
        from governance.models import ApprovalRequest

        approval = ApprovalRequest.objects.get()
        f.as_user(self.client, "treas@college.edu")
        response = self.client.post(
            f"/api/v1/governance/approvals/{approval.id}/decide",
            {"decision": "approve"}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_a_plain_member_still_cannot_propose(self):
        self.assertEqual(self.propose("member@college.edu").status_code, 403)

    def test_the_treasurer_cannot_close_an_event(self):
        """
        EVENT_OPERATORS is deliberately narrower than PROPOSERS: preparing the
        budget is the Treasurer's job, running the event on the night is not.
        """
        event = f.event(self.club, self.venue, days=-1, status=EventStatus.LIVE,
                        title="Ran already")
        f.as_user(self.client, "treas@college.edu")
        response = self.client.post(f"/api/v1/events/{event.id}/close",
                                    {"photo_count": 3}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_the_vice_president_can_close_an_event(self):
        event = f.event(self.club, self.venue, days=-1, status=EventStatus.LIVE,
                        title="Ran already")
        f.as_user(self.client, "vp@college.edu")
        response = self.client.post(f"/api/v1/events/{event.id}/close",
                                    {"photo_count": 3}, format="json")
        self.assertEqual(response.status_code, 200)

    def test_the_vice_president_can_record_spend(self):
        """PRD §5.19.2 and Event_Flows §9.2 both say Yes; the code said No."""
        from budget.models import BudgetStage

        event = f.event(self.club, self.venue, days=-3, status=EventStatus.REPORTED)
        budget = f.budget(event, amounts=(2000,))
        line = budget.lines.first()
        line.amount_sanctioned = line.amount_requested
        line.save()
        budget.stage = BudgetStage.SANCTIONED
        budget.save()
        f.as_user(self.client, "vp@college.edu")
        response = self.client.patch(
            f"/api/v1/budget/budgets/{budget.id}/lines/{line.id}",
            {"amount_spent": "1800"}, format="json")
        self.assertEqual(response.status_code, 200)

    def test_the_capability_payload_separates_the_three(self):
        f.as_user(self.client, "treas@college.edu")
        caps = self.client.get("/api/v1/module/auth/me").data["capabilities"]
        club = str(self.club.id)
        self.assertIn(club, caps["clubs_can_propose"])
        self.assertIn(club, caps["clubs_can_enter_spend"])
        self.assertNotIn(club, caps["clubs_can_operate_events"])


class BudgetBuildingTests(TestCase):
    """
    Pricing an event happens AFTER it is created, by the President or Treasurer.

    A proposal used to need its budget inline at creation, which put the pricing
    before anyone had agreed the event was happening.
    """

    def setUp(self):
        self.client = APIClient()
        f.semester()
        self.club = f.club("Swara")
        self.venue = f.venue("Seminar Hall A", 150)
        self.president = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        self.treasurer = f.student("treas@college.edu", prn="23CS1002")
        f.member(self.club, self.treasurer, R.CLUB_TREASURER)
        self.member = f.student("member@college.edu", prn="23CS1003")
        f.member(self.club, self.member, R.CLUB_MEMBER)
        f.user("society@college.edu", global_roles=[R.CULTURAL_SOCIETY], mfa=True)

    def create_event(self, email="pres@college.edu", submit=False):
        f.as_user(self.client, email)
        starts = f.slot(days=20)
        response = self.client.post("/api/v1/events", {
            "title": "Unpriced Recital", "club": str(self.club.id), "kind": "performance",
            "venue": str(self.venue.id), "starts_at": starts.isoformat(),
            "ends_at": (starts + f.timedelta(hours=2)).isoformat(),
            "capacity": 150, "expected_attendance": 80, "submit": submit,
        }, format="json")
        return response

    def budget_id(self):
        from budget.models import Budget

        return str(Budget.objects.get().id)

    # ---- a shell exists to build on ------------------------------------
    def test_an_event_created_without_a_budget_still_gets_a_budget_shell(self):
        response = self.create_event()
        self.assertEqual(response.status_code, 201, response.data)
        from budget.models import Budget

        budget = Budget.objects.get()
        self.assertEqual(budget.lines.count(), 0)
        self.assertFalse(budget.is_ready_to_submit)

    def test_an_unpriced_event_cannot_be_submitted(self):
        self.create_event()
        from events.models import Event

        event = Event.objects.get()
        f.as_user(self.client, "pres@college.edu")
        response = self.client.post(f"/api/v1/events/{event.id}/submit", {}, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "GOVERNANCE_BUDGET_REQUIRED")

    # ---- the Treasurer adds entries -----------------------------------
    def test_the_treasurer_can_add_a_budget_line(self):
        self.create_event()
        f.as_user(self.client, "treas@college.edu")
        response = self.client.post(f"/api/v1/budget/budgets/{self.budget_id()}/lines",
                                    {"head": "Sound & lighting", "amount_requested": "12000"},
                                    format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["total_requested"], "12000.00")

    def test_the_treasurer_can_add_several_and_then_submit(self):
        self.create_event()
        bid = self.budget_id()
        f.as_user(self.client, "treas@college.edu")
        for head, amount in (("Sound", "8000"), ("Refreshments", "4000"), ("Printing", "600")):
            self.client.post(f"/api/v1/budget/budgets/{bid}/lines",
                             {"head": head, "amount_requested": amount}, format="json")
        from events.models import Event

        event = Event.objects.get()
        f.as_user(self.client, "pres@college.edu")
        response = self.client.post(f"/api/v1/events/{event.id}/submit", {}, format="json")
        self.assertEqual(response.status_code, 200, response.data)

    def test_the_treasurer_can_edit_and_remove_a_line(self):
        self.create_event()
        bid = self.budget_id()
        f.as_user(self.client, "treas@college.edu")
        added = self.client.post(f"/api/v1/budget/budgets/{bid}/lines",
                                 {"head": "Sound", "amount_requested": "8000"},
                                 format="json")
        line_id = added.data["lines"][0]["id"]
        edited = self.client.put(f"/api/v1/budget/budgets/{bid}/lines/{line_id}/edit",
                                 {"amount_requested": "9500"}, format="json")
        self.assertEqual(edited.data["total_requested"], "9500.00")
        removed = self.client.delete(f"/api/v1/budget/budgets/{bid}/lines/{line_id}/remove")
        self.assertEqual(removed.status_code, 200)
        self.assertEqual(len(removed.data["lines"]), 0)

    def test_two_lines_cannot_share_a_head(self):
        """One head appearing twice makes the settlement unreadable."""
        self.create_event()
        bid = self.budget_id()
        f.as_user(self.client, "treas@college.edu")
        self.client.post(f"/api/v1/budget/budgets/{bid}/lines",
                         {"head": "Sound", "amount_requested": "8000"}, format="json")
        again = self.client.post(f"/api/v1/budget/budgets/{bid}/lines",
                                 {"head": "sound", "amount_requested": "500"}, format="json")
        self.assertEqual(again.status_code, 409)
        self.assertEqual(again.data["code"], "BUDGET_LINE_DUPLICATE_HEAD")

    def test_a_plain_member_cannot_add_a_line(self):
        self.create_event()
        f.as_user(self.client, "member@college.edu")
        response = self.client.post(f"/api/v1/budget/budgets/{self.budget_id()}/lines",
                                    {"head": "Sneaky", "amount_requested": "1"},
                                    format="json")
        self.assertEqual(response.status_code, 404)

    def test_lines_freeze_once_an_approver_holds_the_budget(self):
        """Editing under a reviewer would mean they sanction something else."""
        self.create_event()
        bid = self.budget_id()
        f.as_user(self.client, "treas@college.edu")
        self.client.post(f"/api/v1/budget/budgets/{bid}/lines",
                         {"head": "Sound", "amount_requested": "8000"}, format="json")
        from events.models import Event

        f.as_user(self.client, "pres@college.edu")
        self.client.post(f"/api/v1/events/{Event.objects.get().id}/submit", {}, format="json")
        f.as_user(self.client, "treas@college.edu")
        response = self.client.post(f"/api/v1/budget/budgets/{bid}/lines",
                                    {"head": "Extra", "amount_requested": "9999"},
                                    format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "BUDGET_LOCKED")


class NilBudgetTests(TestCase):
    """
    A zero-budget event carries an explicit declaration, never a blank.

    "Nobody has priced this yet" and "this genuinely costs nothing" are different
    things, and an approver must be able to tell which they are looking at.
    """

    def setUp(self):
        self.client = APIClient()
        f.semester()
        self.club = f.club("Kalam", category=f.Club.Category.LITERARY)
        self.venue = f.venue("Seminar Hall B", 120)
        self.treasurer = f.student("treas@college.edu", prn="23CS1002", name="Divya T")
        f.member(self.club, self.treasurer, R.CLUB_TREASURER)
        self.president = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        f.user("society@college.edu", global_roles=[R.CULTURAL_SOCIETY], mfa=True)
        f.user("dean@college.edu", global_roles=[R.DEAN], mfa=True)

        f.as_user(self.client, "pres@college.edu")
        starts = f.slot(days=20)
        self.client.post("/api/v1/events", {
            "title": "Book Club Meetup", "club": str(self.club.id), "kind": "talk",
            "venue": str(self.venue.id), "starts_at": starts.isoformat(),
            "ends_at": (starts + f.timedelta(hours=1)).isoformat(),
            "capacity": 40, "expected_attendance": 25, "submit": False,
        }, format="json")
        from budget.models import Budget
        from events.models import Event

        self.budget = Budget.objects.get()
        self.event = Event.objects.get()

    def declare(self, email="treas@college.edu", reason="Venue is free and the club owns everything"):
        f.as_user(self.client, email)
        return self.client.post(f"/api/v1/budget/budgets/{self.budget.id}/declare-nil",
                                {"reason": reason}, format="json")

    def test_the_treasurer_can_declare_no_budget_required(self):
        response = self.declare()
        self.assertEqual(response.status_code, 200, response.data)
        entry = response.data["nil_declaration"]
        self.assertEqual(entry["head"], "No budget required")
        self.assertIn("free", entry["reason"])
        self.assertEqual(entry["declared_by"], "Divya T")
        self.assertIsNotNone(entry["declared_at"])

    def test_a_declaration_without_a_reason_is_refused(self):
        response = self.declare(reason="n/a")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data["code"], "BUDGET_NIL_REASON_REQUIRED")

    def test_a_declared_nil_event_can_be_submitted_and_approved(self):
        self.declare()
        f.as_user(self.client, "pres@college.edu")
        submitted = self.client.post(f"/api/v1/events/{self.event.id}/submit", {},
                                     format="json")
        self.assertEqual(submitted.status_code, 200, submitted.data)
        from governance.models import ApprovalRequest

        approval = ApprovalRequest.objects.get()
        self.assertEqual(approval.amount_requested, 0)
        # Zero is below the threshold, so no VC gate.
        self.assertNotIn("vc", approval.stages)
        for email in ("society@college.edu", "dean@college.edu"):
            f.as_user(self.client, email, mfa_code="1")
            self.client.post(f"/api/v1/governance/approvals/{approval.id}/decide",
                             {"decision": "approve"}, format="json")
        self.event.refresh_from_db()
        self.assertEqual(self.event.status, EventStatus.PUBLISHED)

    def test_declaring_nil_is_refused_while_priced_lines_exist(self):
        f.as_user(self.client, "treas@college.edu")
        self.client.post(f"/api/v1/budget/budgets/{self.budget.id}/lines",
                         {"head": "Prizes", "amount_requested": "3000"}, format="json")
        response = self.declare()
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "BUDGET_NIL_HAS_LINES")
        self.assertIn("Prizes", response.data["detail"])

    def test_adding_a_priced_line_withdraws_the_declaration(self):
        """The two statements contradict each other; one has to give way."""
        self.declare()
        f.as_user(self.client, "treas@college.edu")
        response = self.client.post(f"/api/v1/budget/budgets/{self.budget.id}/lines",
                                    {"head": "Prizes", "amount_requested": "3000"},
                                    format="json")
        self.assertEqual(response.status_code, 201)
        self.assertIsNone(response.data["nil_declaration"])

    def test_a_nil_declaration_can_be_withdrawn(self):
        self.declare()
        f.as_user(self.client, "treas@college.edu")
        response = self.client.post(
            f"/api/v1/budget/budgets/{self.budget.id}/withdraw-nil", {}, format="json")
        self.assertIsNone(response.data["nil_declaration"])
        self.assertFalse(response.data["is_ready_to_submit"])

    def test_a_nil_budget_settles_with_nothing_to_settle(self):
        from budget.models import BudgetStage

        self.declare()
        self.budget.refresh_from_db()
        self.budget.stage = BudgetStage.SANCTIONED
        self.budget.save()
        self.event.status = EventStatus.REPORTED
        self.event.save()
        f.as_user(self.client, "treas@college.edu")
        response = self.client.post(f"/api/v1/budget/budgets/{self.budget.id}/settle",
                                    {}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["stage"], "settled")
        self.assertEqual(response.data["settlement_problems"], [])

    def test_the_database_refuses_a_nil_budget_with_no_reason(self):
        from django.db import IntegrityError, transaction

        with self.assertRaises(IntegrityError), transaction.atomic():
            self.budget.is_nil = True
            self.budget.nil_reason = ""
            self.budget.save()


class SettlementSequenceTests(TestCase):
    """
    Settlement is the last step, and the API should not describe it as blocked
    before it is reachable.

    A draft budget reporting "enter what was actually spent" presents the normal
    order of work — sanction, run the event, then settle — as a fault in the club's
    work.
    """

    def setUp(self):
        self.client = APIClient()
        f.semester()
        self.club = f.club("Swara")
        self.venue = f.venue("Seminar Hall A", 150)
        self.treasurer = f.student("treas@college.edu", prn="23CS1002")
        f.member(self.club, self.treasurer, R.CLUB_TREASURER)
        self.event = f.event(self.club, self.venue, days=14)
        self.budget = f.budget(self.event, amounts=(9000,))

    def read(self):
        f.as_user(self.client, "treas@college.edu")
        return self.client.get(f"/api/v1/budget/budgets/{self.budget.id}").data

    def test_a_draft_budget_reports_no_settlement_problems(self):
        body = self.read()
        self.assertEqual(body["settlement_problems"], [])
        self.assertFalse(body["can_settle"])
        self.assertEqual(body["settlement_waiting_on"], "sanction")
        self.assertIn("sanctioned before spend", body["settlement_hint"])

    def test_a_budget_under_review_still_reports_none(self):
        from budget.models import BudgetStage

        self.budget.stage = BudgetStage.DEAN_REVIEW
        self.budget.save()
        body = self.read()
        self.assertEqual(body["settlement_problems"], [])
        self.assertEqual(body["settlement_waiting_on"], "sanction")

    def test_sanctioned_but_the_event_has_not_run_waits_on_the_event(self):
        from budget.models import BudgetStage

        self.budget.stage = BudgetStage.SANCTIONED
        self.budget.save()
        body = self.read()
        self.assertEqual(body["settlement_problems"], [],
                         "nothing is blocking yet; the event simply has not happened")
        self.assertFalse(body["can_settle"])
        self.assertEqual(body["settlement_waiting_on"], "event")
        self.assertIn("after the event has run", body["settlement_hint"])

    def test_blockers_appear_only_once_settlement_is_reachable(self):
        from budget.models import BudgetStage

        for line in self.budget.lines.all():
            line.amount_sanctioned = line.amount_requested
            line.save()
        self.budget.stage = BudgetStage.SANCTIONED
        self.budget.save()
        self.event.status = EventStatus.REPORTED
        self.event.save()
        body = self.read()
        self.assertTrue(body["can_settle"])
        self.assertIsNone(body["settlement_waiting_on"])
        codes = {p["code"] for p in body["settlement_problems"]}
        self.assertIn("NO_SPEND_ENTERED", codes,
                      "now it IS a blocker, because settlement is the next step")

    def test_settling_a_draft_is_refused_by_the_api_too(self):
        """The sequence is enforced server-side, not only hidden in the UI."""
        f.as_user(self.client, "treas@college.edu")
        response = self.client.post(f"/api/v1/budget/budgets/{self.budget.id}/settle",
                                    {}, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "BUDGET_NOT_SANCTIONED")

    def test_settling_before_the_event_is_refused(self):
        from budget.models import BudgetStage

        self.budget.stage = BudgetStage.SANCTIONED
        self.budget.save()
        f.as_user(self.client, "treas@college.edu")
        response = self.client.post(f"/api/v1/budget/budgets/{self.budget.id}/settle",
                                    {}, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "BUDGET_EVENT_NOT_RUN")

    def test_a_settled_budget_says_so_rather_than_listing_blockers(self):
        from budget.models import BudgetStage

        self.budget.stage = BudgetStage.SETTLED
        self.budget.save()
        body = self.read()
        self.assertEqual(body["settlement_waiting_on"], "settled")
        self.assertEqual(body["settlement_problems"], [])
        self.assertFalse(body["can_settle"])
