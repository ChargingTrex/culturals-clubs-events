"""
Venue clashes and reassignment.

AGENT_PROMPT §5: reassignment must be atomic — "Two steps leaves a window where
the slot is held by both events or neither." And §9 lists venue precedence as a
genuinely open question, so the system flags the clash and the Dean decides; it
never picks a winner on its own.
"""
from datetime import timedelta

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from common import roles as R
from events.models import Event, EventStatus
from events.services import all_clashes, assert_bookable, clashes_for, reassign_venue
from governance import services as governance
from tests import factories as f


class ClashDetectionTests(TestCase):
    def setUp(self):
        self.hall = f.venue("Seminar Hall A", 150)
        self.club = f.club("Swara")
        self.other_club = f.club("Natya")

    def test_a_confirmed_booking_blocks_a_new_request(self):
        f.event(self.club, self.hall, days=7, hour=16, duration=2,
                status=EventStatus.PUBLISHED, title="First")
        starts = f.timezone.now().replace(hour=17, minute=0, second=0, microsecond=0) \
            + timedelta(days=7)
        with self.assertRaises(Exception) as caught:
            assert_bookable(venue_id=self.hall.id, starts_at=starts,
                            ends_at=starts + timedelta(hours=2))
        self.assertEqual(caught.exception.code, "EVENTS_VENUE_UNAVAILABLE")

    def test_a_pending_request_does_not_block_another_one(self):
        """
        Two clubs may both want Friday evening. Which one gets it is the Dean's
        call, not a validation error, so the second request is accepted and flagged.
        """
        f.event(self.club, self.hall, days=7, hour=16, duration=2,
                status=EventStatus.SUBMITTED, title="First")
        starts = f.timezone.now().replace(hour=17, minute=0, second=0, microsecond=0) \
            + timedelta(days=7)
        soft = assert_bookable(venue_id=self.hall.id, starts_at=starts,
                               ends_at=starts + timedelta(hours=2))
        self.assertEqual(len(soft), 1)
        self.assertEqual(soft[0].title, "First")

    @override_settings(VENUE_BUFFER_MINUTES=30)
    def test_the_setup_buffer_counts_as_part_of_the_booking(self):
        """A crew arriving 20 minutes after the previous show ends is a clash."""
        first = f.event(self.club, self.hall, days=7, hour=16, duration=2,
                        status=EventStatus.PUBLISHED, title="First")   # 16:00-18:00
        starts = first.ends_at + timedelta(minutes=20)                  # 18:20
        with self.assertRaises(Exception):
            assert_bookable(venue_id=self.hall.id, starts_at=starts,
                            ends_at=starts + timedelta(hours=1))

    @override_settings(VENUE_BUFFER_MINUTES=0)
    def test_with_no_buffer_the_same_gap_is_fine(self):
        first = f.event(self.club, self.hall, days=7, hour=16, duration=2,
                        status=EventStatus.PUBLISHED, title="First")
        starts = first.ends_at + timedelta(minutes=20)
        self.assertEqual(assert_bookable(venue_id=self.hall.id, starts_at=starts,
                                         ends_at=starts + timedelta(hours=1)), [])

    def test_a_different_venue_at_the_same_time_is_not_a_clash(self):
        f.event(self.club, self.hall, days=7, hour=16, status=EventStatus.PUBLISHED)
        other = f.venue("Seminar Hall B", 120)
        starts = f.timezone.now().replace(hour=16, minute=0, second=0, microsecond=0) \
            + timedelta(days=7)
        self.assertEqual(assert_bookable(venue_id=other.id, starts_at=starts,
                                         ends_at=starts + timedelta(hours=2)), [])

    def test_each_clashing_pair_is_reported_once(self):
        f.event(self.club, self.hall, days=7, hour=16, duration=2,
                status=EventStatus.SUBMITTED, title="A")
        f.event(self.other_club, self.hall, days=7, hour=17, duration=2,
                status=EventStatus.SUBMITTED, title="B")
        self.assertEqual(len(all_clashes()), 1)


class ReassignmentTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        f.semester()
        self.hall_a = f.venue("Seminar Hall A", 150)
        self.hall_b = f.venue("Seminar Hall B", 150)
        self.tiny = f.venue("Music Room", 40)
        self.club = f.club("Swara")
        self.president = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        self.dean = f.user("dean@college.edu", global_roles=[R.DEAN], mfa=True)
        self.event = f.event(self.club, self.hall_a, days=7, expected=100,
                             status=EventStatus.SUBMITTED, title="Open Mic")

    def reassign(self, email, venue, reason="Hall A double-booked; B has the same setup",
                 mfa_code=""):
        f.as_user(self.client, email, mfa_code=mfa_code)
        return self.client.post(f"/api/v1/events/{self.event.id}/reassign",
                                {"to_venue": str(venue.id), "reason": reason}, format="json")

    def test_the_dean_may_move_an_event(self):
        response = self.reassign("dean@college.edu", self.hall_b, mfa_code="1")
        self.assertEqual(response.status_code, 200)
        self.event.refresh_from_db()
        self.assertEqual(self.event.venue, self.hall_b)

    def test_the_club_president_may_not(self):
        response = self.reassign("pres@college.edu", self.hall_b)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "EVENTS_REASSIGN_DENIED")

    def test_a_reason_is_required_because_the_club_is_shown_it(self):
        response = self.reassign("dean@college.edu", self.hall_b, reason="x", mfa_code="1")
        self.assertEqual(response.status_code, 422)

    def test_a_venue_too_small_for_the_expected_crowd_is_refused(self):
        response = self.reassign("dean@college.edu", self.tiny, mfa_code="1")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "EVENTS_VENUE_TOO_SMALL")

    def test_the_move_records_where_it_came_from_and_why(self):
        self.reassign("dean@college.edu", self.hall_b, mfa_code="1")
        move = self.event.reassignments.first()
        self.assertEqual(move.from_venue, self.hall_a)
        self.assertEqual(move.to_venue, self.hall_b)
        self.assertIn("double-booked", move.reason)
        self.assertEqual(str(move.actor_sub), str(self.dean.id))

    def test_moving_into_an_occupied_venue_is_refused(self):
        f.event(self.other_club if hasattr(self, "other_club") else f.club("Natya"),
                self.hall_b, days=7, hour=18, status=EventStatus.PUBLISHED, title="Taken")
        response = self.reassign("dean@college.edu", self.hall_b, mfa_code="1")
        self.assertEqual(response.status_code, 409)
        self.event.refresh_from_db()
        self.assertEqual(self.event.venue, self.hall_a, "the old slot must still be held")

    def test_the_slot_is_never_held_by_neither_venue(self):
        """
        The atomicity requirement, checked from the outside: after a failed move
        the event still holds its original slot rather than sitting nowhere.
        """
        before = self.event.venue_id
        self.reassign("dean@college.edu", self.tiny, mfa_code="1")   # fails: too small
        self.event.refresh_from_db()
        self.assertEqual(self.event.venue_id, before)
        self.assertEqual(Event.objects.filter(pk=self.event.pk, venue__isnull=True).count(), 0)


class ClashBlocksApprovalTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        f.semester()
        self.hall = f.venue("Seminar Hall A", 150)
        self.club = f.club("Swara")
        self.natya = f.club("Natya")
        self.pres_a = f.student("a@college.edu", prn="23CS1001")
        f.member(self.club, self.pres_a, R.CLUB_PRESIDENT)
        self.pres_b = f.student("b@college.edu", prn="23CS1002")
        f.member(self.natya, self.pres_b, R.CLUB_PRESIDENT)
        f.user("society@college.edu", global_roles=[R.CULTURAL_SOCIETY], mfa=True)

        self.event_a = f.event(self.club, self.hall, days=7, hour=16, duration=2,
                               title="Open Mic", expected=80)
        f.budget(self.event_a, amounts=(5000,))
        self.approval_a = governance.submit(self.event_a, actor=f.ctx_for(self.pres_a.user))
        self.event_b = f.event(self.natya, self.hall, days=7, hour=17, duration=2,
                               title="Workshop", expected=60)
        f.budget(self.event_b, amounts=(5000,))
        governance.submit(self.event_b, actor=f.ctx_for(self.pres_b.user))

    def test_an_approval_over_an_unresolved_clash_is_refused(self):
        """
        Event_Flows: "Resolve under Venues before approving." Approving both would
        put two clubs in one hall.
        """
        self.assertTrue(clashes_for(self.event_a))
        f.as_user(self.client, "society@college.edu", mfa_code="1")
        response = self.client.post(
            f"/api/v1/governance/approvals/{self.approval_a.id}/decide",
            {"decision": "approve"}, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "GOVERNANCE_CLASH_UNRESOLVED")

    def test_the_approval_card_surfaces_the_clash(self):
        f.as_user(self.client, "society@college.edu", mfa_code="1")
        queue = self.client.get("/api/v1/governance/approvals/queue").data
        row = next(r for r in queue["results"] if r["event_title"] == "Open Mic")
        self.assertEqual(len(row["clashes"]), 1)
        self.assertEqual(row["clashes"][0]["title"], "Workshop")

    def test_returning_is_still_possible_while_a_clash_stands(self):
        """A clash must not trap a proposal the approver wants to send back."""
        f.as_user(self.client, "society@college.edu", mfa_code="1")
        response = self.client.post(
            f"/api/v1/governance/approvals/{self.approval_a.id}/decide",
            {"decision": "return", "comment": "Pick another slot; Natya wants this one."},
            format="json")
        self.assertEqual(response.status_code, 200)
