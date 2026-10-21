"""
Delegation of an approval gate (MASTER_SPEC §11.3, PRD §5.13).

A delegation is a window, not a role grant. Every refusal below is asserted
through the API with a real token where the API is the surface, and through
the service where the API's 404 would hide which rule fired.
"""
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from clubs.models import Club
from common import roles as R
from governance import services as governance
from governance.models import ApprovalStage, Delegation, Notification
from identity.models import User
from tests import factories as f


def window(start_hours=-1, end_hours=24):
    now = timezone.now()
    return now + timedelta(hours=start_hours), now + timedelta(hours=end_hours)


class DelegationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        f.semester()
        self.venue = f.venue()
        self.club = f.club("Swara", category=Club.Category.CULTURAL)
        self.president = f.student("pres@college.edu", prn="23CS1001", name="Arjun P")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        self.treasurer = f.student("treas@college.edu", prn="23CS1002", name="Divya T")
        f.member(self.club, self.treasurer, R.CLUB_TREASURER)
        self.outsider = f.student("outsider@college.edu", prn="23CS1004", name="Rohan O")

        self.dean = f.user("dean@college.edu", name="Dean", global_roles=[R.DEAN], mfa=True)
        self.vc = f.user("vc@college.edu", name="VC", global_roles=[R.VICE_CHANCELLOR], mfa=True)
        self.society = f.user("society@college.edu", name="Society",
                              global_roles=[R.CULTURAL_SOCIETY], mfa=True)
        self.admin = f.user("admin@college.edu", name="Admin", global_roles=[R.ADMIN], mfa=True)
        # A faculty member with no approval role of their own: the usual deputy.
        self.deputy = f.user("deputy@college.edu", name="Deputy Faculty")

        self.event = f.event(self.club, self.venue, title="Swara Unplugged")
        f.budget(self.event, amounts=(10000, 5000))
        self.approval = governance.submit(self.event, actor=f.ctx_for(self.president.user),
                                          actor_user=self.president.user)

    # ---- helpers -------------------------------------------------------
    def delegate(self, email, *, stage, to, start_hours=-1, end_hours=24, principal=None,
                 mfa_code="123456"):
        f.as_user(self.client, email, mfa_code=mfa_code)
        starts, ends = window(start_hours, end_hours)
        body = {"stage": stage, "delegate_user": str(to.id), "starts_at": starts.isoformat(),
                "ends_at": ends.isoformat(), "reason": "On leave"}
        if principal is not None:
            body["principal_user"] = str(principal.id)
        return self.client.post("/api/v1/governance/delegations", body, format="json")

    def decide(self, email, decision="approve", approval=None, mfa_code="123456"):
        f.as_user(self.client, email, mfa_code=mfa_code)
        approval = approval or self.approval
        return self.client.post(f"/api/v1/governance/approvals/{approval.id}/decide",
                                {"decision": decision}, format="json")

    # ---- inside the window ---------------------------------------------
    def test_a_delegate_approves_inside_the_window(self):
        created = self.delegate("society@college.edu", stage="cultural_society", to=self.deputy)
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["status"], "active")

        response = self.decide("deputy@college.edu")
        self.assertEqual(response.status_code, 200, response.data)
        self.approval.refresh_from_db()
        self.assertEqual(self.approval.current_stage, ApprovalStage.DEAN)

    def test_the_step_carries_both_names(self):
        self.delegate("society@college.edu", stage="cultural_society", to=self.deputy)
        response = self.decide("deputy@college.edu")
        step = response.data["step"]
        self.assertEqual(step["actor_label"], "Deputy Faculty")
        self.assertEqual(str(step["on_behalf_of"]), str(self.society.id))
        self.assertEqual(step["on_behalf_of_label"], "Society")

        recorded = self.approval.steps.get()
        self.assertEqual(recorded.on_behalf_of, self.society)
        self.assertEqual(str(recorded.actor_sub), str(self.deputy.id))

    def test_a_role_holder_deciding_for_themselves_records_no_principal(self):
        response = self.decide("society@college.edu", mfa_code="123456")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["step"]["on_behalf_of"])
        self.assertEqual(response.data["step"]["on_behalf_of_label"], "")

    def test_the_delegate_sees_the_request_in_their_queue(self):
        self.delegate("society@college.edu", stage="cultural_society", to=self.deputy)
        f.as_user(self.client, "deputy@college.edu", mfa_code="123456")
        queue = self.client.get("/api/v1/governance/approvals/queue").data
        self.assertEqual(queue["count"], 1)
        self.assertEqual(queue["stages_you_hold"], ["cultural_society"])
        self.assertEqual(queue["stages_delegated_to_you"], ["cultural_society"])
        self.assertTrue(queue["results"][0]["my_stage"])

    def test_notifications_for_the_stage_reach_the_active_delegate(self):
        self.delegate("society@college.edu", stage="cultural_society", to=self.deputy)
        self.assertTrue(Notification.objects.filter(user=self.deputy,
                                                    kind="delegation.granted").exists())
        another = f.event(self.club, self.venue, title="Second", days=12)
        f.budget(another, amounts=(1000,))
        governance.submit(another, actor=f.ctx_for(self.president.user))
        self.assertTrue(Notification.objects.filter(user=self.deputy, kind="approval.pending",
                                                    subject__contains="Second").exists())
        self.assertTrue(Notification.objects.filter(user=self.society, kind="approval.pending",
                                                    subject__contains="Second").exists(),
                        "the principal is still told; delegation is cover, not silence")

    # ---- outside the window --------------------------------------------
    def test_refused_before_the_window_opens(self):
        self.delegate("society@college.edu", stage="cultural_society", to=self.deputy,
                      start_hours=2, end_hours=24)
        self.assertEqual(self.decide("deputy@college.edu").status_code, 404,
                         "outside the window the deputy cannot even see the request")
        with self.assertRaises(Exception) as caught:
            governance.decide(self.approval, ctx=f.ctx_for(self.deputy), decision="approve")
        self.assertEqual(getattr(caught.exception, "code", ""), "GOVERNANCE_NOT_APPROVER")

    def test_refused_after_the_window_closes(self):
        delegation = Delegation.objects.create(
            stage="cultural_society", principal_user=self.society, delegate_user=self.deputy,
            starts_at=timezone.now() - timedelta(days=3),
            ends_at=timezone.now() - timedelta(hours=1), created_by=self.society,
        )
        self.assertEqual(delegation.status, "expired")
        self.assertEqual(self.decide("deputy@college.edu").status_code, 404)

    def test_refused_after_revoke(self):
        created = self.delegate("society@college.edu", stage="cultural_society", to=self.deputy)
        f.as_user(self.client, "society@college.edu", mfa_code="123456")
        revoked = self.client.post(
            f"/api/v1/governance/delegations/{created.data['id']}/revoke", {}, format="json")
        self.assertEqual(revoked.status_code, 200, revoked.data)
        self.assertEqual(revoked.data["status"], "revoked")
        self.assertEqual(self.decide("deputy@college.edu").status_code, 404)
        with self.assertRaises(Exception) as caught:
            governance.decide(self.approval, ctx=f.ctx_for(self.deputy), decision="approve")
        self.assertEqual(getattr(caught.exception, "code", ""), "GOVERNANCE_NOT_APPROVER")

    def test_revoking_twice_is_a_conflict(self):
        created = self.delegate("society@college.edu", stage="cultural_society", to=self.deputy)
        url = f"/api/v1/governance/delegations/{created.data['id']}/revoke"
        f.as_user(self.client, "society@college.edu", mfa_code="123456")
        self.client.post(url, {}, format="json")
        again = self.client.post(url, {}, format="json")
        self.assertEqual(again.status_code, 409)
        self.assertEqual(again.data["code"], "GOVERNANCE_DELEGATION_REVOKED")

    def test_the_delegate_cannot_revoke_what_was_given_to_them(self):
        created = self.delegate("society@college.edu", stage="cultural_society", to=self.deputy)
        f.as_user(self.client, "deputy@college.edu", mfa_code="123456")
        response = self.client.post(
            f"/api/v1/governance/delegations/{created.data['id']}/revoke", {}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "GOVERNANCE_DELEGATION_DENIED")

    # ---- rules that still win ------------------------------------------
    def test_a_delegate_with_a_club_role_in_that_club_is_refused(self):
        """
        AGENT_PROMPT §6: no club role approves its own budget. A delegation does
        not launder that — the treasurer of Swara cannot clear Swara's proposal
        however the Society's gate reached them.
        """
        created = self.delegate("society@college.edu", stage="cultural_society",
                                to=self.treasurer.user)
        self.assertEqual(created.status_code, 201, created.data)
        response = self.decide("treas@college.edu")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "GOVERNANCE_SELF_APPROVAL")

    def test_every_delegated_decision_needs_mfa_whatever_the_stage_or_amount(self):
        """
        QA F1. The principal's role is MFA-mandatory at login (§5.5); cover must
        not be a weaker path to the gate. Below threshold, and even for a return,
        a delegate without the claim is refused.
        """
        self.delegate("society@college.edu", stage="cultural_society", to=self.deputy)
        for decision, comment in (("approve", ""), ("return", "Trim the sound budget.")):
            with self.assertRaises(Exception) as caught:
                governance.decide(self.approval, ctx=f.ctx_for(self.deputy, mfa=False),
                                  decision=decision, comment=comment)
            self.assertEqual(getattr(caught.exception, "code", ""),
                             "GOVERNANCE_MFA_REQUIRED", decision)
        step = governance.decide(self.approval, ctx=f.ctx_for(self.deputy, mfa=True),
                                 decision="approve")
        self.assertEqual(step.on_behalf_of, self.society)
        self.assertTrue(step.mfa_verified)

    def test_login_runs_the_mfa_challenge_for_a_delegate_and_issues_the_claim(self):
        """
        QA F1. Login used to issue `mfa=True` only to MFA_REQUIRED_ROLES, so a
        deputy could never clear a gate through the API. Anyone covering a gate
        — or any is_staff account — is challenged like a role holder.
        """
        login = lambda code: self.client.post(  # noqa: E731
            "/api/v1/module/auth/login",
            {"email": "deputy@college.edu", "password": f.PASSWORD, "mfa_code": code},
            format="json")
        before = login("")
        self.assertEqual(before.status_code, 200, "no delegation yet: an ordinary account")
        self.assertFalse(before.data["claims"]["mfa"])

        self.delegate("society@college.edu", stage="cultural_society", to=self.deputy)
        refused = login("")
        self.assertEqual(refused.status_code, 401)
        self.assertEqual(refused.data["code"], "AUTH_MFA_REQUIRED")
        issued = login("123456")
        self.assertEqual(issued.status_code, 200)
        self.assertTrue(issued.data["claims"]["mfa"])

        staff = f.user("staff@college.edu", name="Staff")
        staff.is_staff = True
        staff.save(update_fields=["is_staff"])
        response = self.client.post("/api/v1/module/auth/login",
                                    {"email": "staff@college.edu", "password": f.PASSWORD},
                                    format="json")
        self.assertEqual(response.status_code, 401, "is_staff is challenged too")

    def test_a_vc_delegate_clears_the_gate_through_the_api(self):
        """QA F1, end to end: staff deputy, VC delegation, real login, real decide."""
        big = f.event(self.club, f.venue("Open Air Theatre", 1000), title="Culturals Night",
                      days=30, expected=700)
        f.budget(big, amounts=(80000,))
        approval = governance.submit(big, actor=f.ctx_for(self.president.user))
        self.assertEqual(self.decide("society@college.edu", approval=approval).status_code, 200)
        self.assertEqual(self.decide("dean@college.edu", approval=approval).status_code, 200)
        self.deputy.is_staff = True
        self.deputy.save(update_fields=["is_staff"])
        self.assertEqual(self.delegate("vc@college.edu", stage="vc", to=self.deputy)
                         .status_code, 201)
        response = self.decide("deputy@college.edu", approval=approval)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["step"]["on_behalf_of_label"], "VC")
        self.assertTrue(response.data["step"]["mfa_verified"])

    def test_a_window_longer_than_the_maximum_is_refused(self):
        """QA F1(c). Cover is for an absence; a longer grant is a role change."""
        with self.settings(DELEGATION_MAX_DAYS=30):
            response = self.delegate("dean@college.edu", stage="dean", to=self.deputy,
                                     start_hours=0, end_hours=31 * 24)
            self.assertEqual(response.status_code, 422)
            self.assertEqual(response.data["code"], "GOVERNANCE_DELEGATION_TOO_LONG")
            ok = self.delegate("dean@college.edu", stage="dean", to=self.deputy,
                               start_hours=0, end_hours=30 * 24)
            self.assertEqual(ok.status_code, 201, ok.data)

    def test_a_delegation_is_inert_once_the_principal_loses_the_role(self):
        """
        QA F2. Cover is for a gate the principal holds now. The Society bearer is
        replaced on day 3: the deputy can no longer decide, sees no queue, is not
        notified, and the delegation drops out of the active list — no revoke
        needed.
        """
        created = self.delegate("society@college.edu", stage="cultural_society", to=self.deputy)
        self.society.global_roles = []
        self.society.save(update_fields=["global_roles"])

        self.assertEqual(self.decide("deputy@college.edu").status_code, 404)
        with self.assertRaises(Exception) as caught:
            governance.decide(self.approval, ctx=f.ctx_for(self.deputy, mfa=True),
                              decision="approve")
        self.assertEqual(getattr(caught.exception, "code", ""), "GOVERNANCE_NOT_APPROVER")

        f.as_user(self.client, "deputy@college.edu")   # no MFA demand: nothing is covered
        queue = self.client.get("/api/v1/governance/approvals/queue").data
        self.assertEqual(queue["count"], 0)
        self.assertEqual(queue["stages_delegated_to_you"], [])
        listed = self.client.get("/api/v1/governance/delegations", {"active": "true"}).data
        self.assertEqual(listed["count"], 0)
        self.assertEqual(self.client.get("/api/v1/governance/delegations").data["count"], 1,
                         "the record itself is kept")

        another = f.event(self.club, self.venue, title="Later", days=12)
        f.budget(another, amounts=(1000,))
        governance.submit(another, actor=f.ctx_for(self.president.user))
        self.assertFalse(Notification.objects.filter(user=self.deputy, kind="approval.pending",
                                                     subject__contains="Later").exists())
        self.assertFalse(governance.escalated_requests().filter(pk=created.data["id"]).exists())

    def test_a_delegate_at_a_later_stage_is_told_it_is_not_their_turn(self):
        self.delegate("dean@college.edu", stage="dean", to=self.deputy)
        with self.assertRaises(Exception) as caught:
            governance.decide(self.approval, ctx=f.ctx_for(self.deputy), decision="approve")
        self.assertEqual(getattr(caught.exception, "code", ""), "GOVERNANCE_WRONG_STAGE")

    # ---- who may create one --------------------------------------------
    def test_a_student_cannot_create_a_delegation(self):
        response = self.delegate("outsider@college.edu", stage="dean", to=self.deputy,
                                 mfa_code="")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "GOVERNANCE_DELEGATION_DENIED")
        self.assertEqual(Delegation.objects.count(), 0)

    def test_only_the_holder_of_that_stage_may_delegate_it(self):
        response = self.delegate("dean@college.edu", stage="cultural_society", to=self.deputy)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "GOVERNANCE_DELEGATION_DENIED")

    def test_a_holder_cannot_delegate_on_somebody_elses_behalf(self):
        response = self.delegate("dean@college.edu", stage="dean", to=self.deputy,
                                 principal=self.vc)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "GOVERNANCE_DELEGATION_DENIED")

    def test_an_admin_delegates_for_the_holder_and_the_principal_must_hold_the_stage(self):
        ok = self.delegate("admin@college.edu", stage="dean", to=self.deputy,
                           principal=self.dean)
        self.assertEqual(ok.status_code, 201, ok.data)
        self.assertEqual(str(ok.data["principal_user"]), str(self.dean.id))
        self.assertEqual(str(ok.data["created_by"]), str(self.admin.id))

        wrong = self.delegate("admin@college.edu", stage="dean", to=self.deputy,
                              principal=self.vc)
        self.assertEqual(wrong.status_code, 422)
        self.assertEqual(wrong.data["code"], "GOVERNANCE_PRINCIPAL_NOT_HOLDER")

    def test_the_vc_stage_goes_only_to_a_staff_account_unless_an_admin_records_it(self):
        """
        Rule decided for §11.3: a bare student account cannot stand in for the
        Vice-Chancellor. A staff account (is_staff, or any non-student global
        role) can; an administrator may record an exception knowingly.
        """
        refused = self.delegate("vc@college.edu", stage="vc", to=self.outsider.user)
        self.assertEqual(refused.status_code, 422)
        self.assertEqual(refused.data["code"], "GOVERNANCE_DELEGATE_NOT_STAFF")

        # QA F5: Cultural Society bearers are students here (PRD §4); that role
        # does not make an account staff for the Vice-Chancellor's gate.
        secretary = f.student("sec@college.edu", prn="23CS1077", name="Cultural Sec")
        secretary.user.global_roles = [R.STUDENT, R.CULTURAL_SOCIETY]
        secretary.user.save(update_fields=["global_roles"])
        refused = self.delegate("vc@college.edu", stage="vc", to=secretary.user)
        self.assertEqual(refused.status_code, 422)
        self.assertEqual(refused.data["code"], "GOVERNANCE_DELEGATE_NOT_STAFF")
        allowed = self.delegate("vc@college.edu", stage="vc", to=self.dean)
        self.assertEqual(allowed.status_code, 201, "the Dean role counts as staff")

        self.deputy.is_staff = True
        self.deputy.save(update_fields=["is_staff"])
        allowed = self.delegate("vc@college.edu", stage="vc", to=self.deputy)
        self.assertEqual(allowed.status_code, 201, allowed.data)

        by_admin = self.delegate("admin@college.edu", stage="vc", to=self.outsider.user,
                                 principal=self.vc)
        self.assertEqual(by_admin.status_code, 201, by_admin.data)

    def test_a_window_that_ends_before_it_starts_is_refused_by_the_api_and_the_database(self):
        response = self.delegate("dean@college.edu", stage="dean", to=self.deputy,
                                 start_hours=5, end_hours=1)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data["code"], "GOVERNANCE_DELEGATION_WINDOW")
        with self.assertRaises(IntegrityError), transaction.atomic():
            Delegation.objects.create(stage="dean", principal_user=self.dean,
                                      delegate_user=self.deputy,
                                      starts_at=timezone.now(),
                                      ends_at=timezone.now() - timedelta(hours=1))

    def test_delegating_to_yourself_is_refused_by_the_api_and_the_database(self):
        response = self.delegate("dean@college.edu", stage="dean", to=self.dean)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data["code"], "GOVERNANCE_DELEGATE_IS_PRINCIPAL")
        with self.assertRaises(IntegrityError), transaction.atomic():
            Delegation.objects.create(stage="dean", principal_user=self.dean,
                                      delegate_user=self.dean,
                                      starts_at=timezone.now(),
                                      ends_at=timezone.now() + timedelta(hours=1))

    # ---- listing and audit ---------------------------------------------
    def test_listing_shows_own_delegations_only(self):
        self.delegate("society@college.edu", stage="cultural_society", to=self.deputy)
        self.delegate("dean@college.edu", stage="dean", to=self.vc)

        f.as_user(self.client, "deputy@college.edu", mfa_code="123456")
        self.assertEqual(self.client.get("/api/v1/governance/delegations").data["count"], 1)
        f.as_user(self.client, "dean@college.edu", mfa_code="1")
        self.assertEqual(self.client.get("/api/v1/governance/delegations").data["count"], 1)
        f.as_user(self.client, "outsider@college.edu")
        self.assertEqual(self.client.get("/api/v1/governance/delegations").data["count"], 0)
        f.as_user(self.client, "admin@college.edu", mfa_code="1")
        self.assertEqual(self.client.get("/api/v1/governance/delegations").data["count"], 2)

    def test_creation_decision_and_revoke_are_audited(self):
        from governance.models import AuditEntry

        created = self.delegate("society@college.edu", stage="cultural_society", to=self.deputy)
        self.decide("deputy@college.edu")
        f.as_user(self.client, "society@college.edu", mfa_code="123456")
        self.client.post(f"/api/v1/governance/delegations/{created.data['id']}/revoke",
                         {}, format="json")
        actions = set(AuditEntry.objects.values_list("action", flat=True))
        self.assertIn("delegation.created", actions)
        self.assertIn("delegation.revoked", actions)
        decided = AuditEntry.objects.get(action="approval.approve")
        self.assertEqual(decided.after["on_behalf_of"], str(self.society.id))
        self.assertEqual(decided.after["delegation"], created.data["id"])
