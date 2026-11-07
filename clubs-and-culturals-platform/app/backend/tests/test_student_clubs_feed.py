"""
ADDITIONAL_REQUIREMENTS F-06 / F-07 / F-08: the membership cap, leaving a club,
the feed filters on GET /events, and the caller's own preferences.
"""
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from clubs.models import Club, JoinRequest, Membership
from common import roles as R
from events.models import EventStatus
from governance.models import AuditEntry
from tests import factories as f


class DefaultMembershipCapTests(TestCase):
    """The shipped default is five clubs (C-01, raised from three on 2026-11-06)."""

    def test_the_sixth_open_join_is_refused(self):
        client = APIClient()
        f.student("stu@college.edu", prn="23CS1001")
        clubs = [f.club(f"Club {i}") for i in range(6)]
        f.as_user(client, "stu@college.edu")
        for club in clubs:
            club.join_mode = Club.JoinMode.OPEN
            club.save(update_fields=["join_mode"])
        codes = [client.post(f"/api/v1/clubs/{c.id}/join", {}, format="json").status_code
                 for c in clubs]
        self.assertEqual(codes, [201] * 5 + [409])
        caps = client.get("/api/v1/module/auth/me").data["capabilities"]
        self.assertEqual((caps["my_clubs_count"], caps["max_club_memberships"]), (5, 5))


@override_settings(MAX_CLUB_MEMBERSHIPS=2)
class MembershipCapTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.clubs = [f.club(name) for name in ("Swara", "Natya", "Lens", "Byte")]
        for club in self.clubs[:3]:
            club.join_mode = Club.JoinMode.OPEN
            club.save(update_fields=["join_mode"])
        self.student = f.student("stu@college.edu", prn="23CS1001")
        self.president = f.student("pres@college.edu", prn="23CS1002")
        f.member(self.clubs[3], self.president, R.CLUB_PRESIDENT)

    def join(self, club, email="stu@college.edu"):
        f.as_user(self.client, email)
        return self.client.post(f"/api/v1/clubs/{club.id}/join", {}, format="json")

    def test_sequential_joins_stop_at_the_cap(self):
        self.assertEqual(self.join(self.clubs[0]).status_code, 201)
        self.assertEqual(self.join(self.clubs[1]).status_code, 201)
        third = self.join(self.clubs[2])
        self.assertEqual(third.status_code, 409)
        self.assertEqual(third.data["code"], "CLUBS_MEMBERSHIP_LIMIT")
        self.assertEqual(third.data["detail"],
                         "You can be a member of up to 2 clubs. Leave one to join another.")
        self.assertEqual(Membership.objects.filter(student=self.student,
                                                   ended_at__isnull=True).count(), 2)

    def test_a_join_request_is_refused_at_the_cap(self):
        self.join(self.clubs[0])
        self.join(self.clubs[1])
        response = self.join(self.clubs[3])            # approval club
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "CLUBS_MEMBERSHIP_LIMIT")
        self.assertFalse(JoinRequest.objects.exists())

    def test_accept_is_refused_at_the_cap_and_the_request_stays_pending(self):
        request = JoinRequest.objects.create(club=self.clubs[3], student=self.student)
        self.join(self.clubs[0])
        self.join(self.clubs[1])
        f.as_user(self.client, "pres@college.edu")
        response = self.client.post(
            f"/api/v1/clubs/{self.clubs[3].id}/join-requests/{request.id}/accept", {},
            format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "CLUBS_MEMBERSHIP_LIMIT")
        self.assertIn("must leave one", response.data["detail"])
        request.refresh_from_db()
        self.assertEqual(request.state, JoinRequest.State.PENDING)
        self.assertFalse(Membership.objects.filter(club=self.clubs[3], student=self.student).exists())

    def test_me_counts_memberships_against_the_cap(self):
        self.join(self.clubs[0])
        caps = self.client.get("/api/v1/module/auth/me").data["capabilities"]
        self.assertEqual(caps["my_clubs_count"], 1)
        self.assertEqual(caps["max_club_memberships"], 2)

    def test_the_club_list_says_requested_to_the_student_only(self):
        JoinRequest.objects.create(club=self.clubs[3], student=self.student)
        f.as_user(self.client, "stu@college.edu")
        by_id = {c["id"]: c for c in self.client.get("/api/v1/clubs").data["results"]}
        self.assertEqual(by_id[str(self.clubs[3].id)]["my_join_request_state"], "pending")
        self.assertIsNone(by_id[str(self.clubs[0].id)]["my_join_request_state"])
        f.as_user(self.client, "pres@college.edu")
        by_id = {c["id"]: c for c in self.client.get("/api/v1/clubs").data["results"]}
        self.assertIsNone(by_id[str(self.clubs[3].id)]["my_join_request_state"])


class LeaveTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.club = f.club("Swara")
        self.member = f.student("member@college.edu", prn="23CS1001")
        self.membership = f.member(self.club, self.member)
        self.treasurer = f.student("treas@college.edu", prn="23CS1002")
        f.member(self.club, self.treasurer, R.CLUB_TREASURER)
        self.outsider = f.student("out@college.edu", prn="23CS1003")

    def leave(self, email):
        f.as_user(self.client, email)
        return self.client.post(f"/api/v1/clubs/{self.club.id}/leave", {}, format="json")

    def test_a_member_leaves(self):
        response = self.leave("member@college.edu")
        self.assertEqual(response.status_code, 204)
        self.membership.refresh_from_db()
        self.assertIsNotNone(self.membership.ended_at)
        self.assertTrue(AuditEntry.objects.filter(action="club.left",
                                                  target_id=str(self.membership.id)).exists())
        # The next token no longer carries the club.
        f.as_user(self.client, "member@college.edu")
        self.assertEqual(self.client.get("/api/v1/module/auth/me").data["capabilities"]["clubs"],
                         [])

    def test_an_office_bearer_cannot_leave(self):
        response = self.leave("treas@college.edu")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "CLUBS_OFFICE_BEARER_CANNOT_LEAVE")
        self.assertIn("Treasurer of Swara", response.data["detail"])
        self.assertTrue(Membership.objects.filter(student=self.treasurer,
                                                  ended_at__isnull=True).exists())

    def test_a_non_member_gets_404(self):
        self.assertEqual(self.leave("out@college.edu").status_code, 404)


class FeedFilterTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        f.semester()
        hall = f.venue("Seminar Hall A", 150)
        self.swara = f.club("Swara")
        self.robo = f.club("Robo", category=Club.Category.TECHNICAL)
        # Interleaved dates, so "mine first" is visibly not date order.
        self.robo_early = f.event(self.robo, hall, title="Robo Build", days=5,
                                  status=EventStatus.PUBLISHED)
        self.swara_mid = f.event(self.swara, hall, title="Swara Night", days=10,
                                 status=EventStatus.PUBLISHED)
        self.robo_late = f.event(self.robo, hall, title="Bot Wars", days=15,
                                 status=EventStatus.PUBLISHED)
        self.student = f.student("stu@college.edu", prn="23CS1001")
        f.member(self.swara, self.student)
        f.student("loner@college.edu", prn="23CS1002")

    def titles(self, query, email="stu@college.edu"):
        f.as_user(self.client, email)
        response = self.client.get(f"/api/v1/events?{query}")
        self.assertEqual(response.status_code, 200, response.data)
        return [e["title"] for e in response.data["results"]]

    def test_mine_keeps_only_my_clubs_events(self):
        self.assertEqual(self.titles("mine=true"), ["Swara Night"])
        self.assertEqual(self.titles("mine=true", email="loner@college.edu"), [])

    def test_search_matches_title_or_club_name(self):
        self.assertEqual(self.titles("search=wars"), ["Bot Wars"])
        self.assertEqual(self.titles("search=ROBO"), ["Robo Build", "Bot Wars"])

    def test_feed_ordering_puts_my_clubs_first_then_date_order(self):
        self.assertEqual(self.titles("ordering=feed"), ["Swara Night", "Robo Build", "Bot Wars"])
        self.assertEqual(self.titles("ordering=feed", email="loner@college.edu"),
                         ["Robo Build", "Swara Night", "Bot Wars"])
        self.assertEqual(self.titles(""), ["Robo Build", "Swara Night", "Bot Wars"])


class PreferencesTests(TestCase):
    URL = "/api/v1/module/auth/preferences"

    def setUp(self):
        self.client = APIClient()
        f.student("a@college.edu", prn="23CS1001")
        f.student("b@college.edu", prn="23CS1002")

    def test_patch_stores_and_get_returns(self):
        f.as_user(self.client, "a@college.edu")
        self.assertEqual(self.client.get(self.URL).data, {"personalised_feed": False})
        response = self.client.patch(self.URL, {"personalised_feed": True}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data, {"personalised_feed": True})
        self.assertEqual(self.client.get(self.URL).data, {"personalised_feed": True})
        self.assertEqual(self.client.get("/api/v1/module/auth/me").data["preferences"],
                         {"personalised_feed": True})

    def test_an_unknown_key_is_422(self):
        f.as_user(self.client, "a@college.edu")
        response = self.client.patch(self.URL, {"theme": "dark"}, format="json")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data["code"], "VALIDATION_FAILED")
        self.assertEqual(response.data["errors"][0]["field"], "theme")

    def test_another_users_preferences_are_not_reachable(self):
        f.as_user(self.client, "a@college.edu")
        self.client.patch(self.URL, {"personalised_feed": True}, format="json")
        f.as_user(self.client, "b@college.edu")
        self.assertEqual(self.client.get(self.URL).data, {"personalised_feed": False})
