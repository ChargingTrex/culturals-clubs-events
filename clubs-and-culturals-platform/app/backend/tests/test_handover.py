"""
Office-bearer terms and the annual handover (PRD §5.3, §5.18).

The token is derived from the terms: a President whose term ended yesterday
logs in as a plain member, with no `club_president:<club>` scope, so every
server-side check that reads the scope refuses them. The handover is one
transaction that closes the outgoing terms and opens the incoming ones at the
same instant.
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from django.core.management import call_command

from clubs.models import Membership, OfficeBearerTerm, RoleChange
from clubs.services import current_office_bearers
from common import roles as R
from governance.models import AuditEntry, Notification
from tests import factories as f


class ExpiredTermTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.club = f.club("Swara")
        self.president = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        self.target = f.member(self.club, f.student("t@college.edu", prn="23CS1002"))
        self.now = timezone.now()

    def roles(self, email):
        f.as_user(self.client, email)
        return self.client.get("/api/v1/module/auth/me").data["roles"]

    def test_a_president_whose_term_ended_has_no_president_scope(self):
        OfficeBearerTerm.objects.create(club=self.club, student=self.president,
                                        role=R.CLUB_PRESIDENT,
                                        starts_at=self.now - timedelta(days=400),
                                        ends_at=self.now - timedelta(days=1))
        roles = self.roles("pres@college.edu")
        self.assertNotIn(R.scoped(R.CLUB_PRESIDENT, str(self.club.id)), roles)
        self.assertIn(R.scoped(R.CLUB_MEMBER, str(self.club.id)), roles, "still a member")

    def test_and_a_role_assignment_by_them_is_refused(self):
        OfficeBearerTerm.objects.create(club=self.club, student=self.president,
                                        role=R.CLUB_PRESIDENT,
                                        starts_at=self.now - timedelta(days=400),
                                        ends_at=self.now - timedelta(days=1))
        f.as_user(self.client, "pres@college.edu")
        response = self.client.post(f"/api/v1/memberships/{self.target.id}/role",
                                    {"role": R.CLUB_CORE}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "CLUBS_ROLE_ASSIGN_DENIED")

    def test_a_current_term_carries_the_scope(self):
        OfficeBearerTerm.objects.create(club=self.club, student=self.president,
                                        role=R.CLUB_PRESIDENT,
                                        starts_at=self.now - timedelta(days=30))
        self.assertIn(R.scoped(R.CLUB_PRESIDENT, str(self.club.id)), self.roles("pres@college.edu"))

    def test_a_term_that_has_not_started_carries_nothing_yet(self):
        OfficeBearerTerm.objects.create(club=self.club, student=self.target.student,
                                        role=R.CLUB_SECRETARY,
                                        starts_at=self.now + timedelta(days=7))
        roles = self.roles("t@college.edu")
        self.assertNotIn(R.scoped(R.CLUB_SECRETARY, str(self.club.id)), roles)
        self.assertIn(R.scoped(R.CLUB_MEMBER, str(self.club.id)), roles)

    def test_with_no_terms_the_membership_row_stands(self):
        """Directly assigned roles keep working for clubs that never ran a handover."""
        self.assertIn(R.scoped(R.CLUB_PRESIDENT, str(self.club.id)), self.roles("pres@college.edu"))

    def test_a_direct_role_assignment_opens_a_term(self):
        f.as_user(self.client, "pres@college.edu")
        self.client.post(f"/api/v1/memberships/{self.target.id}/role",
                         {"role": R.CLUB_SECRETARY}, format="json")
        term = OfficeBearerTerm.objects.get(club=self.club, student=self.target.student)
        self.assertEqual(term.role, R.CLUB_SECRETARY)
        self.assertIsNone(term.ends_at)
        self.assertIn(R.scoped(R.CLUB_SECRETARY, str(self.club.id)), self.roles("t@college.edu"))


class HandoverTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.club = f.club("Swara")
        self.other = f.club("Natya")
        self.president = f.student("pres@college.edu", prn="23CS1001", name="Outgoing P")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        self.vp = f.student("vp@college.edu", prn="23CS1002", name="Incoming P")
        f.member(self.club, self.vp, R.CLUB_VICE_PRESIDENT)
        self.treasurer = f.student("treas@college.edu", prn="23CS1003")
        f.member(self.club, self.treasurer, R.CLUB_TREASURER)
        self.member = f.student("member@college.edu", prn="23CS1004", name="Incoming VP")
        f.member(self.club, self.member, R.CLUB_MEMBER)
        self.bystander = f.student("by@college.edu", prn="23CS1005")
        f.member(self.club, self.bystander, R.CLUB_MEMBER)
        self.outsider = f.student("out@college.edu", prn="23CS1006")
        f.member(self.other, self.outsider, R.CLUB_PRESIDENT)
        f.user("dean@college.edu", global_roles=[R.DEAN], mfa=True)
        self.now = timezone.now()

    def handover(self, email, effective_at=None, assignments=None):
        f.as_user(self.client, email)
        return self.client.post(f"/api/v1/clubs/{self.club.id}/handover", {
            "effective_at": (effective_at or self.now - timedelta(minutes=1)).isoformat(),
            "assignments": assignments if assignments is not None else [
                {"student_id": str(self.vp.id), "role": R.CLUB_PRESIDENT},
                {"student_id": str(self.member.id), "role": R.CLUB_VICE_PRESIDENT},
            ],
        }, format="json")

    def roles(self, email):
        f.as_user(self.client, email)
        return self.client.get("/api/v1/module/auth/me").data["roles"]

    def history(self, email, mfa_code=""):
        f.as_user(self.client, email, mfa_code=mfa_code)
        return self.client.get(f"/api/v1/clubs/{self.club.id}/office-bearers/history")

    def test_the_president_hands_over_and_loses_the_office(self):
        response = self.handover("pres@college.edu")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual({t["role"] for t in response.data["terms"]},
                         {R.CLUB_PRESIDENT, R.CLUB_VICE_PRESIDENT})

        club_scope = str(self.club.id)
        self.assertNotIn(R.scoped(R.CLUB_PRESIDENT, club_scope), self.roles("pres@college.edu"))
        self.assertIn(R.scoped(R.CLUB_PRESIDENT, club_scope), self.roles("vp@college.edu"))
        self.assertIn(R.scoped(R.CLUB_VICE_PRESIDENT, club_scope), self.roles("member@college.edu"))

        # The roster rows follow, and the one-president constraint held throughout.
        rows = {m.student.prn: m.role
                for m in Membership.objects.filter(club=self.club, ended_at__isnull=True)}
        self.assertEqual(rows["23CS1001"], R.CLUB_MEMBER)
        self.assertEqual(rows["23CS1002"], R.CLUB_PRESIDENT)
        self.assertEqual(rows["23CS1004"], R.CLUB_VICE_PRESIDENT)
        self.assertEqual(rows["23CS1003"], R.CLUB_TREASURER, "an office not handed over is untouched")

    def test_the_outgoing_president_can_no_longer_assign_roles(self):
        self.handover("pres@college.edu")
        f.as_user(self.client, "pres@college.edu")
        target = Membership.objects.get(student=self.bystander)
        response = self.client.post(f"/api/v1/memberships/{target.id}/role",
                                    {"role": R.CLUB_CORE}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_the_vice_president_may_run_it_too(self):
        self.assertEqual(self.handover("vp@college.edu").status_code, 201)

    def test_the_treasurer_may_not(self):
        response = self.handover("treas@college.edu")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "CLUBS_ROLE_ASSIGN_DENIED")
        self.assertFalse(OfficeBearerTerm.objects.exists())
        self.assertEqual(Membership.objects.get(student=self.president).role, R.CLUB_PRESIDENT)

    def test_another_clubs_president_gets_404(self):
        self.assertEqual(self.handover("out@college.edu").status_code, 404)

    def test_an_incoming_bearer_must_already_be_a_member(self):
        response = self.handover("pres@college.edu", assignments=[
            {"student_id": str(self.outsider.id), "role": R.CLUB_PRESIDENT}])
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data["code"], "CLUBS_HANDOVER_NOT_A_MEMBER")

    def test_one_office_per_handover(self):
        response = self.handover("pres@college.edu", assignments=[
            {"student_id": str(self.vp.id), "role": R.CLUB_PRESIDENT},
            {"student_id": str(self.member.id), "role": R.CLUB_PRESIDENT}])
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data["code"], "CLUBS_HANDOVER_DUPLICATE_ROLE")

    def test_core_team_is_not_an_office(self):
        response = self.handover("pres@college.edu", assignments=[
            {"student_id": str(self.member.id), "role": R.CLUB_CORE}])
        self.assertEqual(response.status_code, 422)

    def test_it_is_logged_and_audited(self):
        self.handover("pres@college.edu")
        changes = RoleChange.objects.filter(membership__club=self.club)
        self.assertEqual(
            {(c.membership.student.prn, c.from_role, c.to_role) for c in changes} >= {
                ("23CS1002", R.CLUB_VICE_PRESIDENT, R.CLUB_PRESIDENT),
                ("23CS1004", R.CLUB_MEMBER, R.CLUB_VICE_PRESIDENT),
                ("23CS1001", R.CLUB_PRESIDENT, R.CLUB_MEMBER),
            }, True)
        entry = AuditEntry.objects.get(action="club.handover", target_id=str(self.club.id))
        self.assertEqual(entry.actor_sub, str(self.president.user.id))
        self.assertEqual(len(entry.after["incoming"]), 2)

    def test_a_future_handover_takes_effect_later_not_now(self):
        response = self.handover("pres@college.edu", effective_at=self.now + timedelta(days=30))
        self.assertEqual(response.status_code, 201, response.data)
        club_scope = str(self.club.id)
        self.assertIn(R.scoped(R.CLUB_PRESIDENT, club_scope), self.roles("pres@college.edu"))
        self.assertNotIn(R.scoped(R.CLUB_PRESIDENT, club_scope), self.roles("vp@college.edu"))
        outgoing = OfficeBearerTerm.objects.get(student=self.president, role=R.CLUB_PRESIDENT)
        self.assertEqual(outgoing.ends_at, self.now + timedelta(days=30))

    def test_the_history_lists_who_held_what_when(self):
        self.handover("pres@college.edu")
        response = self.history("vp@college.edu")       # the new president
        self.assertEqual(response.status_code, 200)
        held = {(t["prn"], t["role"], t["ends_at"] is None) for t in response.data["results"]}
        self.assertIn(("23CS1001", R.CLUB_PRESIDENT, False), held, "outgoing term is closed")
        self.assertIn(("23CS1002", R.CLUB_PRESIDENT, True), held, "incoming term is open")
        self.assertIn(("23CS1002", R.CLUB_VICE_PRESIDENT, False), held)
        self.assertIn(("23CS1004", R.CLUB_VICE_PRESIDENT, True), held)
        current = {(t["prn"], t["role"]) for t in response.data["current"]}
        self.assertEqual(current, {("23CS1002", R.CLUB_PRESIDENT), ("23CS1004", R.CLUB_VICE_PRESIDENT)})

    def test_the_dean_and_the_treasurer_may_read_the_history(self):
        self.handover("pres@college.edu")
        self.assertEqual(self.history("dean@college.edu", mfa_code="1").status_code, 200)
        self.assertEqual(self.history("treas@college.edu").status_code, 200)

    def test_a_plain_member_and_an_outsider_cannot(self):
        self.handover("pres@college.edu")
        self.assertEqual(self.history("by@college.edu").status_code, 404)
        self.assertEqual(self.history("out@college.edu").status_code, 404)


class BackdatedHandoverTests(TestCase):
    """QA F2: a handover dated before the current holder took office is refused."""

    def setUp(self):
        self.client = APIClient()
        self.club = f.club("Swara")
        self.pres = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.pres, R.CLUB_PRESIDENT)
        self.vp = f.student("vp@college.edu", prn="23CS1002")
        f.member(self.club, self.vp, R.CLUB_VICE_PRESIDENT)
        self.member = f.student("m@college.edu", prn="23CS1003")
        f.member(self.club, self.member, R.CLUB_MEMBER)
        self.now = timezone.now()

    def handover(self, email, effective_at, student, role=R.CLUB_PRESIDENT):
        f.as_user(self.client, email)
        return self.client.post(f"/api/v1/clubs/{self.club.id}/handover", {
            "effective_at": effective_at.isoformat(),
            "assignments": [{"student_id": str(student.id), "role": role}],
        }, format="json")

    def current_presidents(self):
        return [t for t in OfficeBearerTerm.objects.filter(club=self.club, role=R.CLUB_PRESIDENT)
                if t.is_current(timezone.now())]

    def test_a_handover_before_the_current_term_started_is_422(self):
        self.assertEqual(self.handover("pres@college.edu", self.now - timedelta(minutes=1),
                                       self.vp).status_code, 201)
        response = self.handover("vp@college.edu", self.now - timedelta(days=2), self.member)
        self.assertEqual(response.status_code, 422, response.data)
        self.assertEqual(response.data["code"], "CLUBS_HANDOVER_BACKDATED")
        self.assertEqual(len(self.current_presidents()), 1)
        self.assertEqual(self.current_presidents()[0].student_id, self.vp.id)
        self.assertEqual(Membership.objects.get(student=self.member).role, R.CLUB_MEMBER,
                         "nothing changed")

    def test_the_same_handover_dated_after_the_term_start_is_fine(self):
        self.handover("pres@college.edu", self.now - timedelta(minutes=1), self.vp)
        response = self.handover("vp@college.edu", self.now - timedelta(seconds=10), self.member)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual([t.student_id for t in self.current_presidents()], [self.member.id])

    def test_a_term_opened_by_a_direct_assignment_counts_too(self):
        f.as_user(self.client, "pres@college.edu")
        secretary = Membership.objects.get(student=self.member)
        self.client.post(f"/api/v1/memberships/{secretary.id}/role",
                         {"role": R.CLUB_SECRETARY}, format="json")
        response = self.handover("pres@college.edu", self.now - timedelta(days=1), self.vp,
                                 role=R.CLUB_SECRETARY)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data["code"], "CLUBS_HANDOVER_BACKDATED")


class HandoverNotificationTests(TestCase):
    """QA F7: incoming and outgoing bearers are told, once the handover commits."""

    def setUp(self):
        self.client = APIClient()
        self.club = f.club("Swara")
        self.pres = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.pres, R.CLUB_PRESIDENT)
        self.vp = f.student("vp@college.edu", prn="23CS1002")
        f.member(self.club, self.vp, R.CLUB_VICE_PRESIDENT)
        self.member = f.student("m@college.edu", prn="23CS1003")
        f.member(self.club, self.member, R.CLUB_MEMBER)
        f.member(self.club, f.student("by@college.edu", prn="23CS1004"), R.CLUB_MEMBER)

    def test_incoming_and_outgoing_are_notified_in_app_and_by_email(self):
        from django.core import mail

        f.as_user(self.client, "pres@college.edu")
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(f"/api/v1/clubs/{self.club.id}/handover", {
                "effective_at": (timezone.now() - timedelta(minutes=1)).isoformat(),
                "assignments": [{"student_id": str(self.vp.id), "role": R.CLUB_PRESIDENT},
                                {"student_id": str(self.member.id), "role": R.CLUB_VICE_PRESIDENT}],
            }, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        told = set(Notification.objects.filter(kind="club.handover")
                   .values_list("user__email", flat=True))
        self.assertEqual(told, {"pres@college.edu", "vp@college.edu", "m@college.edu"})
        self.assertNotIn("by@college.edu", told, "a bystander hears nothing")
        self.assertEqual(sorted(m.to[0] for m in mail.outbox),
                         ["m@college.edu", "pres@college.edu", "vp@college.edu"])
        outgoing = Notification.objects.get(user__email="pres@college.edu", kind="club.handover")
        self.assertIn("ends", outgoing.subject)

    def test_a_refused_handover_announces_nothing(self):
        f.as_user(self.client, "pres@college.edu")
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(f"/api/v1/clubs/{self.club.id}/handover", {
                "effective_at": timezone.now().isoformat(),
                "assignments": [{"student_id": str(self.vp.id), "role": R.CLUB_CORE}],
            }, format="json")
        self.assertEqual(response.status_code, 422)
        self.assertFalse(Notification.objects.filter(kind="club.handover").exists())


class TermsDriveRecipientsAndRowsTests(TestCase):
    """QA F3: who is "the President" comes from the terms, and rows catch up by job."""

    def setUp(self):
        self.client = APIClient()
        self.club = f.club("Swara")
        self.old = f.student("old@college.edu", prn="23CS1001")
        f.member(self.club, self.old, R.CLUB_PRESIDENT)
        self.new = f.student("new@college.edu", prn="23CS1002")
        f.member(self.club, self.new, R.CLUB_MEMBER)
        now = timezone.now()
        # The state a dated handover leaves once its date has passed.
        OfficeBearerTerm.objects.create(club=self.club, student=self.old, role=R.CLUB_PRESIDENT,
                                        starts_at=now - timedelta(days=400),
                                        ends_at=now - timedelta(days=1))
        OfficeBearerTerm.objects.create(club=self.club, student=self.new, role=R.CLUB_PRESIDENT,
                                        starts_at=now - timedelta(days=1))

    def test_current_office_bearers_follows_the_terms(self):
        bearers = current_office_bearers(self.club, R.ROLE_ASSIGNERS)
        self.assertEqual([m.student.prn for m in bearers], ["23CS1002"])

    def test_with_no_terms_the_rows_decide(self):
        OfficeBearerTerm.objects.all().delete()
        bearers = current_office_bearers(self.club, R.ROLE_ASSIGNERS)
        self.assertEqual([m.student.prn for m in bearers], ["23CS1001"])

    def test_the_join_queue_notification_reaches_the_current_president(self):
        f.student("app@college.edu", prn="23CS1003")
        f.as_user(self.client, "app@college.edu")
        self.assertEqual(self.client.post(f"/api/v1/clubs/{self.club.id}/join", {},
                                          format="json").status_code, 202)
        told = set(Notification.objects.filter(kind="club.join_requested")
                   .values_list("user__email", flat=True))
        self.assertEqual(told, {"new@college.edu"})

    def test_apply_due_terms_command_brings_the_rows_in_line(self):
        self.assertEqual(Membership.objects.get(student=self.old).role, R.CLUB_PRESIDENT)
        call_command("apply_due_terms")
        self.assertEqual(Membership.objects.get(student=self.old).role, R.CLUB_MEMBER)
        self.assertEqual(Membership.objects.get(student=self.new).role, R.CLUB_PRESIDENT)
        self.assertEqual(RoleChange.objects.filter(membership__club=self.club).count(), 2)
        # Idempotent: a second run changes nothing.
        call_command("apply_due_terms")
        self.assertEqual(RoleChange.objects.filter(membership__club=self.club).count(), 2)
