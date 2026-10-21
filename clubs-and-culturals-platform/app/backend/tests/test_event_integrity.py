"""
Event integrity: who may delete a proposal, venue bookings under a lock and a
constraint, and the organiser scope.

B-00a: `DELETE /events/{id}` is a club act on a proposal that never left the
club. B-00b: the clash check and the insert run under a lock on the venue row,
and PostgreSQL additionally refuses overlapping confirmed bookings outright.
B-00c: `event_organiser:<event_id>` is granted locally through the event's
organiser roster, so the Organiser role can be exercised standalone.
"""
import threading
import unittest
from datetime import timedelta

from django.db import IntegrityError, connection, transaction
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from clubs.models import Club
from common import roles as R
from events.models import Event, EventOrganiser, EventStatus
from governance.models import AuditEntry
from tests import factories as f


def _slot(days=7, hour=16):
    return timezone.now().replace(hour=hour, minute=0, second=0, microsecond=0) + timedelta(days=days)


class EventDeleteTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        f.semester()
        self.hall = f.venue("Seminar Hall A", 150)
        self.club = f.club("Swara")
        self.natya = f.club("Natya")
        self.president = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        self.treasurer = f.student("treas@college.edu", prn="23CS1002")
        f.member(self.club, self.treasurer, R.CLUB_TREASURER)
        self.core = f.student("core@college.edu", prn="23CS1006")
        f.member(self.club, self.core, R.CLUB_CORE)
        self.member = f.student("member@college.edu", prn="23CS1003")
        f.member(self.club, self.member, R.CLUB_MEMBER)
        self.outsider = f.student("anyone@college.edu", prn="23CS1004")
        self.other_pres = f.student("natya@college.edu", prn="23CS1005")
        f.member(self.natya, self.other_pres, R.CLUB_PRESIDENT)
        f.user("dean@college.edu", global_roles=[R.DEAN], mfa=True)
        self.draft = f.event(self.club, self.hall, days=7, title="Draft")
        self.published = f.event(self.club, self.hall, days=9, title="Published",
                                 status=EventStatus.PUBLISHED)

    def delete(self, email, event, mfa_code=""):
        f.as_user(self.client, email, mfa_code=mfa_code)
        return self.client.delete(f"/api/v1/events/{event.id}")

    def test_a_student_deleting_a_published_event_gets_404(self):
        """The event is public, but the delete route is not: 404, not 403."""
        response = self.delete("anyone@college.edu", self.published)
        self.assertEqual(response.status_code, 404)
        self.assertTrue(Event.objects.filter(pk=self.published.pk).exists())

    def test_another_clubs_president_gets_404_too(self):
        response = self.delete("natya@college.edu", self.published)
        self.assertEqual(response.status_code, 404)

    def test_the_president_cannot_delete_a_published_event(self):
        response = self.delete("pres@college.edu", self.published)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "EVENT_NOT_DELETABLE")
        self.assertIn("published", response.data["detail"])
        self.assertTrue(Event.objects.filter(pk=self.published.pk).exists())

    def test_the_president_can_delete_a_draft(self):
        response = self.delete("pres@college.edu", self.draft)
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Event.objects.filter(pk=self.draft.pk).exists())
        entry = AuditEntry.objects.filter(action="event.deleted",
                                          target_id=str(self.draft.pk)).first()
        self.assertIsNotNone(entry, "deletion is audited")
        self.assertEqual(entry.before["status"], "draft")
        self.assertEqual(entry.actor_sub, str(self.president.user.id))

    def test_returned_and_rejected_proposals_can_be_deleted(self):
        for state in (EventStatus.RETURNED, EventStatus.REJECTED):
            event = f.event(self.club, self.hall, days=12, title=state, status=state)
            self.assertEqual(self.delete("pres@college.edu", event).status_code, 204, state)

    def test_a_submitted_proposal_cannot_be_deleted_from_under_the_approver(self):
        event = f.event(self.club, self.hall, days=12, status=EventStatus.SUBMITTED)
        response = self.delete("pres@college.edu", event)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "EVENT_NOT_DELETABLE")

    def test_a_plain_member_of_the_club_gets_403(self):
        response = self.delete("member@college.edu", self.draft)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "EVENTS_DELETE_DENIED")
        self.assertTrue(Event.objects.filter(pk=self.draft.pk).exists())

    def test_core_team_gets_403(self):
        """Door staff, but not a proposer: the wrong-role test for this restriction."""
        response = self.delete("core@college.edu", self.draft)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "EVENTS_DELETE_DENIED")

    def test_the_treasurer_is_a_proposer_and_may_delete_a_draft(self):
        """
        PROPOSERS deliberately includes the Treasurer (common/roles.py): they
        may raise and edit a proposal, so they may withdraw one of their own
        club's drafts too. Deleting follows the same set as creating.
        """
        self.assertEqual(self.delete("treas@college.edu", self.draft).status_code, 204)

    def test_the_dean_may_not_delete_a_clubs_draft(self):
        response = self.delete("dean@college.edu", self.draft, mfa_code="1")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "EVENTS_DELETE_DENIED")


class VenueBookingLockTests(TestCase):
    """The locked path, on whatever database the suite runs (SQLite included)."""

    def setUp(self):
        self.client = APIClient()
        f.semester()
        self.hall = f.venue("Seminar Hall A", 150)
        self.club = f.club("Swara")
        self.natya = f.club("Natya")
        self.president = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        self.starts = _slot(days=7, hour=16)

    def propose(self, *, starts=None, submit=True, title="Open Mic"):
        starts = starts or self.starts
        f.as_user(self.client, "pres@college.edu")
        return self.client.post("/api/v1/events", {
            "title": title, "club": str(self.club.id), "kind": "performance",
            "venue": str(self.hall.id),
            "starts_at": starts.isoformat(), "ends_at": (starts + timedelta(hours=2)).isoformat(),
            "capacity": 150, "expected_attendance": 90,
            "budget_lines": [{"head": "Sound", "amount_requested": "5000"}],
            "submit": submit,
        }, format="json")

    def test_a_hard_clash_is_still_refused(self):
        f.event(self.natya, self.hall, days=7, hour=17, status=EventStatus.PUBLISHED, title="Taken")
        response = self.propose()
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "EVENTS_VENUE_UNAVAILABLE")
        self.assertFalse(Event.objects.filter(title="Open Mic").exists())

    def test_a_soft_clash_is_still_accepted_and_flagged(self):
        f.event(self.natya, self.hall, days=7, hour=17, status=EventStatus.SUBMITTED, title="Pending")
        response = self.propose()
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual([c["title"] for c in response.data["soft_clashes"]], ["Pending"])

    def test_submission_rechecks_the_slot(self):
        """A draft that sat for weeks is checked again when it is finally sent."""
        draft = self.propose(submit=False)
        self.assertEqual(draft.status_code, 201, draft.data)
        f.event(self.natya, self.hall, days=7, hour=17, status=EventStatus.PUBLISHED, title="Taken")
        response = self.client.post(f"/api/v1/events/{draft.data['id']}/submit", {}, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "EVENTS_VENUE_UNAVAILABLE")
        self.assertEqual(Event.objects.get(pk=draft.data["id"]).status, EventStatus.DRAFT)

    def test_submission_reports_soft_clashes(self):
        draft = self.propose(submit=False)
        f.event(self.natya, self.hall, days=7, hour=17, status=EventStatus.SUBMITTED, title="Pending")
        response = self.client.post(f"/api/v1/events/{draft.data['id']}/submit", {}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([c["title"] for c in response.data["soft_clashes"]], ["Pending"])


@unittest.skipUnless(connection.vendor == "postgresql",
                     "exclusion constraint and row locks exist only on PostgreSQL")
class VenueExclusionConstraintTests(TransactionTestCase):
    """events/migrations/0004: confirmed bookings of one venue never overlap."""

    def setUp(self):
        self.hall = f.venue("Seminar Hall A", 150)
        self.club = f.club("Swara")
        self.natya = f.club("Natya")

    def test_two_confirmed_bookings_cannot_overlap(self):
        f.event(self.club, self.hall, days=7, hour=16, status=EventStatus.PUBLISHED)
        with self.assertRaises(IntegrityError), transaction.atomic():
            f.event(self.natya, self.hall, days=7, hour=17, status=EventStatus.PUBLISHED)

    def test_a_pending_request_may_overlap_a_confirmed_one(self):
        """Submitted is advisory (soft clash); only confirmed statuses are excluded."""
        f.event(self.club, self.hall, days=7, hour=16, status=EventStatus.PUBLISHED)
        f.event(self.natya, self.hall, days=7, hour=17, status=EventStatus.SUBMITTED)

    def test_back_to_back_bookings_are_allowed_by_the_constraint(self):
        """The buffer is the application's job; the constraint is the floor."""
        first = f.event(self.club, self.hall, days=7, hour=16, duration=2,
                        status=EventStatus.PUBLISHED)
        Event.objects.create(
            title="Next", club=self.natya, venue=self.hall, starts_at=first.ends_at,
            ends_at=first.ends_at + timedelta(hours=1), capacity=100, expected_attendance=50,
            status=EventStatus.PUBLISHED,
        )


@unittest.skipUnless(connection.vendor == "postgresql",
                     "row locks are a no-op on SQLite; the race needs PostgreSQL")
class ConcurrentBookingTests(TransactionTestCase):
    """
    Two requests for one slot at the same instant. The venue-row lock makes
    them queue, so the second always sees the first.
    """

    def setUp(self):
        f.semester()
        self.hall_a = f.venue("Seminar Hall A", 150)
        self.hall_b = f.venue("Seminar Hall B", 150)
        self.hall_c = f.venue("Seminar Hall C", 150)
        self.club = f.club("Swara")
        self.natya = f.club("Natya")
        self.pres_a = f.student("a@college.edu", prn="23CS1001")
        f.member(self.club, self.pres_a, R.CLUB_PRESIDENT)
        self.pres_b = f.student("b@college.edu", prn="23CS1002")
        f.member(self.natya, self.pres_b, R.CLUB_PRESIDENT)
        f.user("dean@college.edu", global_roles=[R.DEAN], mfa=True)
        self.starts = _slot(days=7, hour=16)

    def _run_together(self, calls):
        barrier = threading.Barrier(len(calls))
        results = [None] * len(calls)

        def run(index, call):
            try:
                barrier.wait(timeout=10)
                results[index] = call()
            finally:
                connection.close()

        threads = [threading.Thread(target=run, args=(i, c)) for i, c in enumerate(calls)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=30)
        return results

    def _proposal(self, token, club, title):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        return lambda: client.post("/api/v1/events", {
            "title": title, "club": str(club.id), "kind": "performance",
            "venue": str(self.hall_a.id),
            "starts_at": self.starts.isoformat(),
            "ends_at": (self.starts + timedelta(hours=2)).isoformat(),
            "capacity": 150, "expected_attendance": 90,
            "budget_lines": [{"head": "Sound", "amount_requested": "5000"}],
            "submit": True,
        }, format="json")

    def test_concurrent_proposals_for_one_slot_see_each_other(self):
        token_a = f.token_for(APIClient(), "a@college.edu")
        token_b = f.token_for(APIClient(), "b@college.edu")
        results = self._run_together([
            self._proposal(token_a, self.club, "Swara's"),
            self._proposal(token_b, self.natya, "Natya's"),
        ])
        self.assertEqual([r.status_code for r in results], [201, 201])
        flagged = [r for r in results if r.data["soft_clashes"]]
        self.assertEqual(len(flagged), 1,
                         "whichever went second must have seen the first; neither may miss it")

    def test_concurrent_moves_into_one_free_hall_let_exactly_one_in(self):
        event_a = f.event(self.club, self.hall_a, days=7, hour=16, status=EventStatus.PUBLISHED)
        event_c = f.event(self.natya, self.hall_c, days=7, hour=16, status=EventStatus.PUBLISHED)
        token = f.token_for(APIClient(), "dean@college.edu", mfa_code="1")

        def move(event):
            client = APIClient()
            client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
            return lambda: client.post(f"/api/v1/events/{event.id}/reassign",
                                       {"to_venue": str(self.hall_b.id),
                                        "reason": "Hall needed for exams"}, format="json")

        results = self._run_together([move(event_a), move(event_c)])
        self.assertEqual(sorted(r.status_code for r in results), [200, 409])
        self.assertEqual(Event.objects.filter(venue=self.hall_b).count(), 1)


class OrganiserScopeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        f.semester()
        self.hall = f.venue("Seminar Hall A", 150)
        self.club = f.club("Swara")
        self.natya = f.club("Natya")
        self.president = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        self.vp = f.student("vp@college.edu", prn="23CS1005")
        f.member(self.club, self.vp, R.CLUB_VICE_PRESIDENT)
        self.treasurer = f.student("treas@college.edu", prn="23CS1002")
        f.member(self.club, self.treasurer, R.CLUB_TREASURER)
        # No club role at all: whatever the organiser can do, the grant did it.
        self.organiser = f.student("org@college.edu", prn="23CS1003", name="Gokul O")
        self.event = f.event(self.club, self.hall, days=7, title="Open Mic",
                             status=EventStatus.PUBLISHED)
        self.other = f.event(self.natya, self.hall, days=9, title="Workshop",
                             status=EventStatus.PUBLISHED)

    def assign(self, email, event=None, student=None):
        f.as_user(self.client, email)
        return self.client.post(f"/api/v1/events/{(event or self.event).id}/organisers",
                                {"student_id": str((student or self.organiser).id)}, format="json")

    def roster(self, event):
        return self.client.get(f"/api/v1/participation/events/{event.id}/roster")

    def test_the_president_may_name_an_organiser(self):
        response = self.assign("pres@college.edu")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["prn"], "23CS1003")
        self.assertTrue(AuditEntry.objects.filter(action="event.organiser_added",
                                                  target_id=str(self.event.id)).exists())

    def test_the_vice_president_may_too(self):
        self.assertEqual(self.assign("vp@college.edu").status_code, 201)

    def test_the_treasurer_may_not(self):
        response = self.assign("treas@college.edu")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "EVENTS_ORGANISER_ASSIGN_DENIED")
        self.assertFalse(EventOrganiser.objects.exists())

    def test_the_grant_reaches_the_token_and_opens_the_roster(self):
        self.assign("pres@college.edu")
        f.as_user(self.client, "org@college.edu")
        me = self.client.get("/api/v1/module/auth/me").data
        self.assertIn(R.scoped(R.EVENT_ORGANISER, str(self.event.id)), me["roles"])
        self.assertEqual(me["capabilities"]["organiser_events"], [str(self.event.id)])
        self.assertEqual(self.roster(self.event).status_code, 200)

    def test_the_organiser_is_refused_at_another_event(self):
        self.assign("pres@college.edu")
        f.as_user(self.client, "org@college.edu")
        self.assertEqual(self.roster(self.other).status_code, 404)

    def test_without_a_grant_the_roster_is_404(self):
        f.as_user(self.client, "org@college.edu")
        self.assertEqual(self.roster(self.event).status_code, 404)

    def test_naming_the_same_organiser_twice_is_409(self):
        self.assign("pres@college.edu")
        response = self.assign("pres@college.edu")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "EVENTS_ORGANISER_EXISTS")

    def test_withdrawing_the_grant_closes_the_roster_again(self):
        self.assign("pres@college.edu")
        f.as_user(self.client, "pres@college.edu")
        response = self.client.delete(
            f"/api/v1/events/{self.event.id}/organisers/{self.organiser.id}")
        self.assertEqual(response.status_code, 204)
        f.as_user(self.client, "org@college.edu")
        self.assertEqual(self.roster(self.event).status_code, 404)

    def test_the_treasurer_cannot_withdraw_a_grant_either(self):
        self.assign("pres@college.edu")
        f.as_user(self.client, "treas@college.edu")
        response = self.client.delete(
            f"/api/v1/events/{self.event.id}/organisers/{self.organiser.id}")
        self.assertEqual(response.status_code, 403)

    def test_an_expired_grant_carries_no_scope(self):
        EventOrganiser.objects.create(event=self.event, student=self.organiser,
                                      ends_at=timezone.now() - timedelta(minutes=1))
        f.as_user(self.client, "org@college.edu")
        me = self.client.get("/api/v1/module/auth/me").data
        self.assertNotIn(R.scoped(R.EVENT_ORGANISER, str(self.event.id)), me["roles"])
        self.assertEqual(self.roster(self.event).status_code, 404)


class OrganiserGrantWindowTests(TestCase):
    """QA F6: a grant is time-bound to the event plus a limited window."""

    def setUp(self):
        self.client = APIClient()
        f.semester()
        self.club = f.club("Swara")
        self.pres = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.pres, R.CLUB_PRESIDENT)
        self.organiser = f.student("org@college.edu", prn="23CS1002")
        self.event = f.event(self.club, f.venue(), days=7, status=EventStatus.PUBLISHED)
        f.as_user(self.client, "pres@college.edu")

    def grant(self, **extra):
        return self.client.post(f"/api/v1/events/{self.event.id}/organisers",
                                {"student_id": str(self.organiser.id), **extra}, format="json")

    @override_settings(ORGANISER_GRACE_HOURS=4)
    def test_no_end_means_event_end_plus_the_grace_window(self):
        response = self.grant()
        self.assertEqual(response.status_code, 201, response.data)
        grant = EventOrganiser.objects.get(event=self.event, student=self.organiser)
        self.assertEqual(grant.ends_at, self.event.ends_at + timedelta(hours=4))

    @override_settings(ORGANISER_GRACE_HOURS=12)
    def test_the_grace_window_is_configuration(self):
        self.grant()
        grant = EventOrganiser.objects.get(event=self.event, student=self.organiser)
        self.assertEqual(grant.ends_at, self.event.ends_at + timedelta(hours=12))

    def test_an_explicit_end_within_the_cap_is_kept(self):
        wanted = self.event.ends_at + timedelta(days=2)
        response = self.grant(ends_at=wanted.isoformat())
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(EventOrganiser.objects.get().ends_at, wanted)

    def test_an_end_past_the_cap_is_refused(self):
        response = self.grant(ends_at=(self.event.ends_at + timedelta(days=8)).isoformat())
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data["code"], "EVENTS_ORGANISER_GRANT_TOO_LONG")
        self.assertFalse(EventOrganiser.objects.exists())

    def test_a_malformed_organiser_id_is_404(self):
        self.client.raise_request_exception = False
        response = self.client.delete(f"/api/v1/events/{self.event.id}/organisers/not-a-uuid")
        self.assertEqual(response.status_code, 404)


class EventCategoryFilterTests(TestCase):
    """B-16: `?category=` is the club's category, applied server-side so it holds across pages."""

    def setUp(self):
        self.client = APIClient()
        f.semester()
        hall = f.venue("Seminar Hall A", 150)
        swara = f.club("Swara", category=Club.Category.CULTURAL)
        self.robo = f.club("Robo", category=Club.Category.TECHNICAL)
        for i in range(3):
            f.event(self.robo, hall, title=f"Robo {i}", days=10 + i, status=EventStatus.PUBLISHED)
        for i in range(2):
            f.event(swara, hall, title=f"Swara {i}", days=20 + i, status=EventStatus.PUBLISHED)
        f.student("stu@college.edu", prn="23CS1001")
        f.as_user(self.client, "stu@college.edu")

    def test_the_filter_holds_across_pages(self):
        seen, pages = [], 0
        url = "/api/v1/events?category=technical&page_size=2"
        while url:
            response = self.client.get(url)
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.data["count"], 3)
            seen += response.data["results"]
            url = response.data["next"]
            pages += 1
        self.assertEqual(pages, 2)
        self.assertEqual(len(seen), 3)
        self.assertEqual({str(e["club"]) for e in seen}, {str(self.robo.id)})

    def test_an_unknown_category_is_an_empty_page_not_422(self):
        response = self.client.get("/api/v1/events?category=astrology")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)
        self.assertEqual(response.data["results"], [])

    def test_without_the_filter_every_published_event_is_listed(self):
        response = self.client.get("/api/v1/events")
        self.assertEqual(response.data["count"], 5)
