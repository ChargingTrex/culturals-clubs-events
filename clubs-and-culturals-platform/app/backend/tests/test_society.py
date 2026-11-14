"""
AR-08: the Cultural Society's Secretary and Vice-Secretary.

They hold the Society's approval stage, may move a booking while its proposal
is still with the Society, and keep the Society's member list. A plain Society
member sees the work and decides nothing; the Dean appoints the officers.
"""
from datetime import timedelta

from django.test import TestCase
from rest_framework.test import APIClient

from common import roles as R
from governance import services as governance
from governance.models import ApprovalStage, Notification
from tests import factories as f

ROSTER = "/api/v1/module/cultural-society/members"


class SocietyBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        f.semester()
        self.hall, self.other_hall = f.venue("Seminar Hall A", 150), f.venue("Seminar Hall B", 150)
        self.club = f.club("Swara")
        self.president = f.student("pres@college.edu", prn="23CS1001", name="Arjun P")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        self.vice_president = f.student("vp@college.edu", prn="23CS1002", name="Meera V")
        f.member(self.club, self.vice_president, R.CLUB_VICE_PRESIDENT)
        self.plain = f.student("plain@college.edu", prn="23CS1003", name="Rohan M")
        f.member(self.club, self.plain, R.CLUB_MEMBER)

        self.dean = f.user("dean@college.edu", name="Dean", global_roles=[R.DEAN], mfa=True)
        self.secretary = f.user("sec@college.edu", name="Secretary",
                                global_roles=[R.SOCIETY_SECRETARY], mfa=True)
        self.vice = f.user("vice@college.edu", name="Vice-Secretary",
                           global_roles=[R.SOCIETY_VICE_SECRETARY], mfa=True)
        self.member = f.user("member@college.edu", name="Society Member",
                             global_roles=[R.CULTURAL_SOCIETY], mfa=True)

        self.start = f.slot(days=7, hour=17)
        self.event = f.event(self.club, self.hall, title="Swara Unplugged", starts=self.start)
        f.budget(self.event, amounts=(10000,))
        self.approval = governance.submit(self.event, actor=f.ctx_for(self.president.user),
                                          actor_user=self.president.user)

    def login(self, email):
        return f.as_user(self.client, email, mfa_code="123456")

    def decide(self, email, decision="approve"):
        self.login(email)
        return self.client.post(f"/api/v1/governance/approvals/{self.approval.id}/decide",
                                {"decision": decision}, format="json")

    def move(self, email, **body):
        self.login(email)
        body.setdefault("reason", "The hall is needed for an exam")
        return self.client.post(f"/api/v1/events/{self.event.id}/reassign", body, format="json")

    def later(self, hours=2):
        return {"starts_at": (self.start + timedelta(hours=hours)).isoformat(),
                "ends_at": (self.start + timedelta(hours=hours + 2)).isoformat()}


class SocietyApprovalTests(SocietyBase):
    def test_the_vice_secretary_approves_at_the_society_stage(self):
        response = self.decide("vice@college.edu")
        self.assertEqual(response.status_code, 200)
        self.approval.refresh_from_db()
        self.assertEqual(self.approval.current_stage, ApprovalStage.DEAN)
        self.assertEqual(self.approval.steps.get().actor_role, R.SOCIETY_VICE_SECRETARY)

    def test_the_secretary_approves_at_the_society_stage(self):
        self.assertEqual(self.decide("sec@college.edu").status_code, 200)
        self.assertEqual(self.approval.steps.get().actor_role, R.SOCIETY_SECRETARY)

    def test_a_plain_society_member_cannot_decide(self):
        self.assertIn(self.decide("member@college.edu").status_code, (403, 404))
        self.approval.refresh_from_db()
        self.assertEqual(self.approval.current_stage, ApprovalStage.CULTURAL_SOCIETY)

    def test_only_the_officers_hold_the_stage(self):
        for email, stages, officer in (("sec@college.edu", ["cultural_society"], True),
                                       ("vice@college.edu", ["cultural_society"], True),
                                       ("member@college.edu", [], False)):
            self.login(email)
            caps = self.client.get("/api/v1/module/auth/me").data["capabilities"]
            self.assertEqual(caps["approval_stages"], stages, email)
            self.assertEqual(caps["is_society_officer"], officer, email)
            self.assertTrue(caps["is_cultural_society"], email)
            self.assertTrue(caps["can_see_overview"], email)

    def test_both_officers_are_told_a_proposal_is_waiting(self):
        told = set(Notification.objects.filter(kind="approval.pending")
                   .values_list("user__email", flat=True))
        self.assertLessEqual({"sec@college.edu", "vice@college.edu"}, told)
        self.assertNotIn("member@college.edu", told)


class UpcomingQueueTests(SocietyBase):
    """A proposal still with the Society is visible to the Dean as on its way."""

    def queue(self, email):
        self.login(email)
        return self.client.get("/api/v1/governance/approvals/queue").data

    def titles(self, rows):
        return [r["event_title"] for r in rows]

    def test_the_dean_sees_it_as_upcoming_until_the_society_approves(self):
        before = self.queue("dean@college.edu")
        self.assertEqual(self.titles(before["results"]), [])
        self.assertEqual(self.titles(before["upcoming"]), ["Swara Unplugged"])
        self.assertEqual(before["upcoming"][0]["current_stage"], "cultural_society")

        self.assertEqual(self.decide("sec@college.edu").status_code, 200)
        after = self.queue("dean@college.edu")
        self.assertEqual(self.titles(after["results"]), ["Swara Unplugged"])
        self.assertEqual(after["upcoming"], [])

    def test_the_society_has_nothing_upcoming_and_a_member_has_no_queue(self):
        officer = self.queue("sec@college.edu")
        self.assertEqual(self.titles(officer["results"]), ["Swara Unplugged"])
        self.assertEqual(officer["upcoming"], [])
        # Once it has moved on to the Dean it is behind the Society, not ahead of it.
        self.decide("sec@college.edu")
        self.assertEqual(self.queue("sec@college.edu")["upcoming"], [])


class SocietyMoveTests(SocietyBase):
    def test_the_secretary_moves_a_proposal_that_is_with_the_society(self):
        Notification.objects.all().delete()
        response = self.move("sec@college.edu", to_venue=str(self.other_hall.id), **self.later())
        self.assertEqual(response.status_code, 200, response.data)
        self.event.refresh_from_db()
        self.assertEqual(self.event.venue_id, self.other_hall.id)
        self.assertEqual(self.event.starts_at, self.start + timedelta(hours=2))
        # The club's leadership is told, with the reason.
        told = Notification.objects.filter(kind="event.venue_changed")
        self.assertEqual(set(told.values_list("user__email", flat=True)),
                         {"pres@college.edu", "vp@college.edu"})
        self.assertIn("The hall is needed for an exam", told.first().body)
        self.assertIn("Seminar Hall B", told.first().body)

    def test_the_vice_secretary_moves_only_the_time(self):
        self.assertEqual(self.move("vice@college.edu", **self.later()).status_code, 200)

    def test_a_plain_society_member_cannot_move(self):
        response = self.move("member@college.edu", **self.later())
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "EVENTS_REASSIGN_DENIED")

    def test_after_the_society_approves_only_the_dean_moves(self):
        self.assertEqual(self.decide("sec@college.edu").status_code, 200)
        refused = self.move("sec@college.edu", **self.later())
        self.assertEqual(refused.status_code, 403)
        self.assertIn("only the Dean", refused.data["detail"])
        self.assertEqual(self.move("dean@college.edu", **self.later()).status_code, 200)

    def test_the_club_cannot_move_its_own_proposal(self):
        for email in ("pres@college.edu", "vp@college.edu"):
            self.assertEqual(self.move(email, **self.later()).status_code, 403, email)

    def test_a_move_into_a_taken_hour_is_refused_for_the_secretary_too(self):
        f.event(f.club("Natya"), self.other_hall, title="Recital", starts=self.start,
                status="published")
        response = self.move("sec@college.edu", to_venue=str(self.other_hall.id))
        self.assertEqual(response.status_code, 409)

    def test_the_calendar_says_who_may_move_what(self):
        published = f.event(self.club, self.other_hall, title="Recital",
                            starts=self.start, status="published")
        expected = {"dean@college.edu": {"Swara Unplugged": True, "Recital": True},
                    "sec@college.edu": {"Swara Unplugged": True, "Recital": False},
                    "member@college.edu": {"Swara Unplugged": False, "Recital": False},
                    "pres@college.edu": {"Swara Unplugged": False, "Recital": False}}
        for email, want in expected.items():
            self.login(email)
            day = self.start.date().isoformat()
            bookings = self.client.get("/api/v1/venue-calendar", {"from": day, "to": day}).data["bookings"]
            self.assertEqual({b["title"]: b["can_move"] for b in bookings}, want, email)
        self.assertTrue(published.pk)


class SocietyRosterTests(SocietyBase):
    def add(self, email, who, role=None):
        self.login(email)
        body = {"email": who, **({"role": role} if role else {})}
        return self.client.post(ROSTER, body, format="json")

    def remove(self, email, user):
        self.login(email)
        return self.client.delete(f"{ROSTER}/{user.id}")

    def test_the_roster_lists_officers_first(self):
        self.login("member@college.edu")
        response = self.client.get(ROSTER)
        self.assertEqual(response.status_code, 200)
        self.assertEqual([m["role_label"] for m in response.data["members"]],
                         ["Secretary", "Vice-Secretary", "Member"])
        self.assertFalse(response.data["can_manage"])

    def test_a_student_cannot_read_or_change_the_roster(self):
        self.login("plain@college.edu")
        self.assertEqual(self.client.get(ROSTER).status_code, 403)
        self.assertEqual(self.add("plain@college.edu", "plain@college.edu").status_code, 403)

    def test_an_officer_adds_and_removes_a_member(self):
        added = self.add("vice@college.edu", "Plain@college.edu")
        self.assertEqual(added.status_code, 201, added.data)
        self.plain.user.refresh_from_db()
        self.assertEqual(self.plain.user.global_roles, [R.STUDENT, R.CULTURAL_SOCIETY])
        self.assertTrue(Notification.objects.filter(user=self.plain.user,
                                                    kind="society.role_set").exists())
        self.assertEqual(self.add("sec@college.edu", "plain@college.edu").status_code, 409)

        removed = self.remove("sec@college.edu", self.plain.user)
        self.assertEqual(removed.status_code, 200)
        self.plain.user.refresh_from_db()
        self.assertEqual(self.plain.user.global_roles, [R.STUDENT])

    def test_a_plain_member_manages_nobody(self):
        self.assertEqual(self.add("member@college.edu", "plain@college.edu").status_code, 403)
        self.assertEqual(self.remove("member@college.edu", self.member).status_code, 403)

    def test_an_officer_cannot_appoint_or_remove_an_officer(self):
        self.assertEqual(
            self.add("sec@college.edu", "member@college.edu", R.SOCIETY_VICE_SECRETARY).status_code, 403)
        self.assertEqual(self.remove("sec@college.edu", self.vice).status_code, 403)
        # Nor demote one by re-adding them as a member.
        self.assertEqual(
            self.add("sec@college.edu", "vice@college.edu", R.CULTURAL_SOCIETY).status_code, 403)
        self.vice.refresh_from_db()
        self.assertEqual(self.vice.global_roles, [R.SOCIETY_VICE_SECRETARY])

    def test_the_dean_replaces_the_vice_secretary(self):
        taken = self.add("dean@college.edu", "member@college.edu", R.SOCIETY_VICE_SECRETARY)
        self.assertEqual(taken.status_code, 409)
        self.assertEqual(taken.data["code"], "SOCIETY_OFFICE_TAKEN")
        self.assertEqual(self.remove("dean@college.edu", self.vice).status_code, 200)
        appointed = self.add("dean@college.edu", "member@college.edu", R.SOCIETY_VICE_SECRETARY)
        self.assertEqual(appointed.status_code, 201)
        self.member.refresh_from_db()
        self.assertEqual(self.member.global_roles, [R.SOCIETY_VICE_SECRETARY])
        self.assertEqual(self.decide("member@college.edu").status_code, 200)

    def test_an_unknown_address_is_refused(self):
        response = self.add("sec@college.edu", "nobody@college.edu")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data["code"], "SOCIETY_NO_SUCH_ACCOUNT")

    def test_removing_someone_outside_the_society_is_a_404(self):
        self.assertEqual(self.remove("sec@college.edu", self.dean).status_code, 404)
