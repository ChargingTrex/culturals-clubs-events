"""AR-03: the Wednesday open block — two 1-hour slots, first come first served, auto-approved."""
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from common import roles as R
from events.models import Event, EventStatus
from tests import factories as f


def wednesday(hour, weeks=1):
    local = timezone.now().astimezone(ZoneInfo(settings.DISPLAY_TIME_ZONE))
    days = (2 - local.weekday()) % 7 + 7 * weeks
    return local.replace(hour=hour, minute=0, second=0, microsecond=0) + timedelta(days=days)


class OpenBlockTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.hall = f.venue("Seminar Hall A", 150)
        self.swara, self.natya = f.club("Swara"), f.club("Natya")
        for email, prn, club, role in (("swara@college.edu", "23CS1001", self.swara, R.CLUB_PRESIDENT),
                                       ("natya@college.edu", "23CS1002", self.natya, R.CLUB_VICE_PRESIDENT),
                                       ("treas@college.edu", "23CS1003", self.swara, R.CLUB_TREASURER)):
            f.member(club, f.student(email, prn=prn), role)

    def book(self, email, club, start, venue=None):
        f.as_user(self.client, email)
        return self.client.post("/api/v1/open-block", {
            "club": str(club.id), "venue": str((venue or self.hall).id),
            "starts_at": start.isoformat()}, format="json")

    def test_a_president_books_a_slot_and_it_is_published_with_no_budget(self):
        response = self.book("swara@college.edu", self.swara, wednesday(15))
        self.assertEqual(response.status_code, 201, response.data)
        event = Event.objects.get()
        self.assertEqual((event.kind, event.status), (Event.Kind.OPEN_BLOCK, EventStatus.PUBLISHED))
        self.assertEqual(event.ends_at - event.starts_at, timedelta(hours=1))
        self.assertTrue(event.budget.is_nil)

    def test_first_come_first_served_the_second_club_is_refused(self):
        self.book("swara@college.edu", self.swara, wednesday(16))
        response = self.book("natya@college.edu", self.natya, wednesday(16))
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "EVENTS_VENUE_UNAVAILABLE")

    def test_the_other_slot_is_still_free(self):
        self.book("swara@college.edu", self.swara, wednesday(15))
        self.assertEqual(self.book("natya@college.edu", self.natya, wednesday(16)).status_code, 201)

    def test_one_slot_per_club_per_wednesday(self):
        self.book("swara@college.edu", self.swara, wednesday(15))
        response = self.book("swara@college.edu", self.swara, wednesday(16), venue=f.venue("Hall B", 80))
        self.assertEqual(response.data["code"], "EVENTS_OPEN_BLOCK_ONE_PER_CLUB")

    def test_outside_the_block_is_refused(self):
        for start in (wednesday(14), wednesday(17), wednesday(15) + timedelta(days=1)):
            response = self.book("swara@college.edu", self.swara, start)
            self.assertEqual(response.status_code, 422, start)
            self.assertEqual(response.data["code"], "EVENTS_NOT_OPEN_BLOCK")

    def test_a_treasurer_cannot_book(self):
        self.assertEqual(self.book("treas@college.edu", self.swara, wednesday(15)).status_code, 403)

    def test_a_pending_proposal_in_that_hour_is_not_jumped(self):
        start = wednesday(15)
        Event.objects.create(title="Pitch", club=self.natya, venue=self.hall, starts_at=start,
                             ends_at=start + timedelta(hours=2), capacity=100,
                             expected_attendance=50, status=EventStatus.SUBMITTED)
        self.assertEqual(self.book("swara@college.edu", self.swara, start).status_code, 409)

    def test_the_slots_list_shows_who_holds_each_venue(self):
        self.book("swara@college.edu", self.swara, wednesday(15))
        f.as_user(self.client, "natya@college.edu")
        response = self.client.get("/api/v1/open-block", {"date": wednesday(15).date().isoformat()})
        self.assertEqual(response.status_code, 200)
        first, second = response.data["slots"]
        self.assertEqual(first["venues"][0]["booked_by"], "Swara")
        self.assertIsNone(second["venues"][0]["booked_by"])
