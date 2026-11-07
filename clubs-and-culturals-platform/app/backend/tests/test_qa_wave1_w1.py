"""
QA (wave 1, W1 review): tests that expose defects in the waitlist delivery.
Each test states the rule it proves; a failure here is a finding in
docs/qa/wave-1-w1.md, not a flaky test.
"""
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from common import roles as R
from events.models import EventStatus
from participation import services
from participation.models import Registration, ScanResult
from tests import factories as f


class WaitlistHoldsNoPlaceTests(TestCase):
    """A waitlisted registration holds no place and no pass — by any route."""

    def setUp(self):
        self.client = APIClient()
        self.club = f.club("Lens")
        self.president = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        self.event = f.event(self.club, f.venue(), days=0, status=EventStatus.LIVE, capacity=1)
        self.holder = services.register_student(
            self.event, f.student("first@college.edu", prn="23CS1002"))
        self.waiting = f.student("second@college.edu", prn="23CS1003")
        self.queued = services.register_student(self.event, self.waiting)
        self.assertTrue(self.queued.waitlisted)

    def test_a_waitlisted_student_cannot_mint_a_pass_by_reissuing(self):
        """
        POST /registrations/{id}/reissue-pass on a waitlisted row must be
        refused: a pass is a working credential and the row holds no place.
        """
        f.as_user(self.client, "second@college.edu")
        response = self.client.post(
            f"/api/v1/participation/registrations/{self.queued.id}/reissue-pass", format="json")
        self.assertEqual(response.status_code, 409, response.data)
        self.assertIsNone(services.live_pass(self.queued), "no pass for a queue entry")

    def test_the_door_refuses_a_pass_held_by_a_waitlisted_registration(self):
        """
        Even if a pass exists for a waitlisted row, scanning it must not admit
        the student past capacity: the event already has its one place taken.
        """
        event_pass = services.issue_pass(self.queued)
        outcome = services.resolve(event_pass.token, self.event,
                                   operator=self.president.user, station_id="GATE-1")
        self.assertNotEqual(outcome.result, ScanResult.ACCEPTED, outcome.verdict)
        self.queued.refresh_from_db()
        self.assertFalse(self.queued.attended, "a queue entry was admitted past capacity")

    def test_the_database_refuses_waitlisted_and_attended_together(self):
        """Rule 3: the invariant 'a queue entry was never admitted' belongs in a CHECK."""
        with self.assertRaises(IntegrityError), transaction.atomic():
            Registration.objects.create(
                event=self.event, student=f.student("x@college.edu", prn="23CS1009"),
                waitlisted=True, attended=True, checked_in_at=timezone.now())


class CancelRaceTests(TestCase):
    """
    The cancel view fetches the registration, then the service takes the event
    lock. A check-in that lands between the two must be seen under the lock.
    """

    def setUp(self):
        self.club = f.club("Lens")
        self.president = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        self.event = f.event(self.club, f.venue(), days=0, status=EventStatus.LIVE, capacity=1)
        self.first = f.student("first@college.edu", prn="23CS1002")
        self.holder = services.register_student(self.event, self.first)
        self.waiting = f.student("second@college.edu", prn="23CS1003")
        services.register_student(self.event, self.waiting)

    def test_a_stale_cancel_cannot_cancel_an_attended_registration_and_promote(self):
        stale = Registration.objects.get(pk=self.holder.pk)   # what the view fetched
        services.check_in_manually(self.event, self.first, operator=self.president.user)
        with self.assertRaises(Exception) as caught:
            services.cancel_registration(stale)
        self.assertEqual(getattr(caught.exception, "code", None),
                         "PARTICIPATION_ALREADY_ATTENDED")
        self.holder.refresh_from_db()
        self.assertIsNone(self.holder.cancelled_at, "an attended row was cancelled")
        self.assertTrue(Registration.objects.get(event=self.event, student=self.waiting)
                        .waitlisted, "promoted into a place still physically occupied")
        self.assertLessEqual(services.confirmed_count(self.event), self.event.capacity)
