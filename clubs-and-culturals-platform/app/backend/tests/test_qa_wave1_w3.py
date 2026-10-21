"""
QA tests for wave-1 W3 (commit 8a2be7a): delegation, SLA, envelope, receipt
files. Each test states a rule the delivered code should uphold and fails on
8a2be7a; the finding ids refer to docs/qa/wave-1-w3.md.
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from budget.models import BudgetStage
from clubs.models import Club
from common import roles as R
from events.models import EventStatus
from governance import services as governance
from governance.models import ApprovalStage
from tests import factories as f


def window(start_hours=-1, end_hours=24):
    now = timezone.now()
    return now + timedelta(hours=start_hours), now + timedelta(hours=end_hours)


class DelegationQaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        f.semester()
        self.venue = f.venue("Open Air Theatre", 1000)
        self.club = f.club("Robo", category=Club.Category.TECHNICAL)
        self.president = f.student("pres@college.edu", prn="23CS1001", name="Arjun P")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        self.dean = f.user("dean@college.edu", name="Dean", global_roles=[R.DEAN], mfa=True)
        self.vc = f.user("vc@college.edu", name="VC", global_roles=[R.VICE_CHANCELLOR], mfa=True)
        # The usual deputy: a staff account with no approval role of its own.
        self.deputy = f.user("deputy@college.edu", name="Deputy Faculty")
        self.deputy.is_staff = True
        self.deputy.save(update_fields=["is_staff"])

    def submit(self, amount, title="Big"):
        event = f.event(self.club, self.venue, title=title, days=20, expected=500)
        f.budget(event, amounts=(amount,))
        return governance.submit(event, actor=f.ctx_for(self.president.user))

    def delegate(self, email, *, stage, to, mfa_code="1"):
        f.as_user(self.client, email, mfa_code=mfa_code)
        starts, ends = window()
        return self.client.post("/api/v1/governance/delegations",
                                {"stage": stage, "delegate_user": str(to.id),
                                 "starts_at": starts.isoformat(), "ends_at": ends.isoformat()},
                                format="json")

    def decide(self, email, approval, mfa_code=""):
        f.as_user(self.client, email, mfa_code=mfa_code)
        return self.client.post(f"/api/v1/governance/approvals/{approval.id}/decide",
                                {"decision": "approve"}, format="json")

    def test_f1_a_vc_delegate_can_decide_through_the_api(self):
        """
        F1. The VC gate always requires the mfa claim, and the login view only
        issues that claim to MFA_REQUIRED_ROLES. A staff deputy holding none of
        those roles is accepted as a VC delegate (201) but can never clear the
        gate through the API, whatever code they supply.
        """
        approval = self.submit(80000)
        self.assertEqual(self.decide("dean@college.edu", approval, mfa_code="1").status_code,
                         200)
        approval.refresh_from_db()
        self.assertEqual(approval.current_stage, ApprovalStage.VC)
        self.assertEqual(self.delegate("vc@college.edu", stage="vc", to=self.deputy)
                         .status_code, 201)
        response = self.decide("deputy@college.edu", approval, mfa_code="123456")
        self.assertEqual(response.status_code, 200,
                         f"VC delegate cannot decide via the API: {response.data}")

    def test_f2_a_delegation_ends_when_the_principal_loses_the_role(self):
        """F2. Cover is for a gate the principal holds; once they no longer hold
        it there is nothing to stand in for, yet the delegate keeps deciding."""
        approval = self.submit(10000, title="Small")
        self.assertEqual(self.delegate("dean@college.edu", stage="dean", to=self.deputy)
                         .status_code, 201)
        self.dean.global_roles = []
        self.dean.save(update_fields=["global_roles"])
        # Rework F1(b): an is_staff account is challenged for MFA at login, so the
        # deputy logs in with a code; the refusal under test is the decision's.
        response = self.decide("deputy@college.edu", approval, mfa_code="1")
        self.assertNotEqual(response.status_code, 200,
                            "deputy still approves for a principal who lost the Dean role")


class EnvelopeQaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.club = f.club("Swara")
        self.treasurer = f.student("treas@college.edu", prn="23CS1002")
        f.member(self.club, self.treasurer, R.CLUB_TREASURER)

    def test_f4_an_out_of_range_year_is_422_not_500(self):
        """F4. `?year=10000` reaches a `starts_at__year` lookup that builds
        datetime(10000, 1, 1) and raises; the API answers 500, not a problem+json 422."""
        f.as_user(self.client, "treas@college.edu")
        for year in ("10000", "0"):
            response = self.client.get(f"/api/v1/budget/envelopes/{self.club.id}",
                                       {"year": year})
            self.assertEqual(response.status_code, 422, (year, response.status_code))
            # Rework F4: the bound has its own code so a client can tell "bad
            # year" from a generic validation failure.
            self.assertEqual(response.data["code"], "BUDGET_ENVELOPE_YEAR")


SVG = b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"


class ReceiptFileQaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.club = f.club("Swara")
        self.treasurer = f.student("treas@college.edu", prn="23CS1002")
        f.member(self.club, self.treasurer, R.CLUB_TREASURER)
        self.event = f.event(self.club, f.venue(), days=-3, status=EventStatus.REPORTED)
        self.budget = f.budget(self.event, amounts=(10000,))
        self.budget.stage = BudgetStage.SANCTIONED
        self.budget.save()
        self.line = self.budget.lines.first()

    def test_f3_an_svg_receipt_is_not_rendered_inline(self):
        """
        F3. `image/svg+xml` passes the upload allowlist (`image/*`) and may carry
        script. Served `inline` with the stored type on the API origin, the
        script runs for whoever opens it (the Dean, the Society, the VC).
        """
        from django.core.files.uploadedfile import SimpleUploadedFile

        from budget import services as budget_services

        f.as_user(self.client, "treas@college.edu")
        created = self.client.post(
            f"/api/v1/budget/budgets/{self.budget.id}/lines/{self.line.id}/receipts",
            {"file": SimpleUploadedFile("bill.svg", SVG, content_type="image/svg+xml")},
            format="multipart")
        # Rework F3: the exact allowlist refuses the SVG at upload. The serving
        # rule is proved on a row stored before the allowlist was exact.
        self.assertEqual(created.status_code, 422, created.data)
        self.assertEqual(created.data["code"], "BUDGET_RECEIPT_TYPE")
        old = budget_services.attach_receipt(self.line, file_name="bill.svg", content=SVG,
                                             content_type="image/svg+xml")
        response = self.client.get(f"/api/v1/budget/budgets/{self.budget.id}/lines/"
                                   f"{self.line.id}/receipts/{old.id}/file")
        self.assertEqual(response.status_code, 200)
        disposition = response["Content-Disposition"]
        self.assertTrue(disposition.startswith("attachment")
                        or response["Content-Type"] == "application/octet-stream",
                        f"SVG served inline as {response['Content-Type']}: {disposition}")
