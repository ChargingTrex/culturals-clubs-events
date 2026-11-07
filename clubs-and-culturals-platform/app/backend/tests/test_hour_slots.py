"""
C-02 and C-03: events are booked in whole hours on the campus clock, a clash is
two bookings sharing an hour in one venue, and the calendar is open to the
Cultural Society.
"""
from datetime import timedelta

from django.test import TestCase
from rest_framework.test import APIClient

from common import roles as R
from events.models import Event, EventStatus
from events.services import assert_bookable
from tests import factories as f


def booked(club, venue, *, start, hours=2, status=EventStatus.PUBLISHED, title="Booked"):
    return Event.objects.create(title=title, club=club, venue=venue, starts_at=start,
                                ends_at=start + timedelta(hours=hours), capacity=100,
                                expected_attendance=50, status=status)


class HourSlotValidationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.club = f.club("Swara")
        self.venue = f.venue("Seminar Hall A", 150)
        f.member(self.club, f.student("pres@college.edu", prn="23CS1001"), R.CLUB_PRESIDENT)
        f.as_user(self.client, "pres@college.edu")

    def propose(self, starts, hours=2):
        return self.client.post("/api/v1/events", {
            "title": "Monsoon Ragas", "club": str(self.club.id), "kind": "performance",
            "venue": str(self.venue.id), "starts_at": starts.isoformat(),
            "ends_at": (starts + timedelta(hours=hours)).isoformat(),
            "capacity": 100, "expected_attendance": 80, "submit": False,
        }, format="json")

    def field_errors(self, response):
        return {e["field"] for e in response.data.get("errors", [])}

    def test_on_the_hour_in_india_is_accepted(self):
        self.assertEqual(self.propose(f.slot(days=10, hour=18)).status_code, 201)

    def test_half_past_in_india_is_refused_on_both_fields(self):
        response = self.propose(f.slot(days=10, hour=18) + timedelta(minutes=30))
        self.assertGreaterEqual(response.status_code, 400)
        self.assertEqual(self.field_errors(response), {"starts_at", "ends_at"})

    def test_a_utc_hour_is_half_past_on_the_campus_clock_and_is_refused(self):
        utc_hour = f.timezone.now().replace(hour=12, minute=0, second=0, microsecond=0) \
            + timedelta(days=10)
        self.assertGreaterEqual(self.propose(utc_hour).status_code, 400)

    def test_an_edit_off_the_hour_is_refused(self):
        event_id = self.propose(f.slot(days=10, hour=18)).data["id"]
        bad = f.slot(days=10, hour=19) + timedelta(minutes=15)
        response = self.client.patch(f"/api/v1/events/{event_id}",
                                     {"starts_at": bad.isoformat()}, format="json")
        self.assertGreaterEqual(response.status_code, 400)
        self.assertEqual(self.field_errors(response), {"starts_at"})


class HourClashTests(TestCase):
    """With the default buffer of 0, sharing an hour is the clash rule."""

    def setUp(self):
        self.club = f.club("Swara")
        self.hall = f.venue("Seminar Hall A", 150)
        self.start = f.slot(days=7, hour=17)
        booked(self.club, self.hall, start=self.start, hours=1, title="Five o'clock")

    def test_back_to_back_hours_do_not_clash(self):
        nxt = self.start + timedelta(hours=1)
        self.assertEqual(assert_bookable(venue_id=self.hall.id, starts_at=nxt,
                                         ends_at=nxt + timedelta(hours=1)), [])

    def test_sharing_an_hour_clashes_and_the_message_reads_campus_time(self):
        with self.assertRaises(Exception) as caught:
            assert_bookable(venue_id=self.hall.id, starts_at=self.start,
                            ends_at=self.start + timedelta(hours=2))
        self.assertEqual(caught.exception.code, "EVENTS_VENUE_UNAVAILABLE")
        self.assertIn("from 17:00 to 18:00 that day.", caught.exception.detail)


class CalendarAccessTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        club, hall = f.club("Swara"), f.venue("Seminar Hall A", 150)
        start = f.slot(days=3, hour=17)
        booked(club, hall, start=start, status=EventStatus.SUBMITTED, title="Open Mic")
        booked(club, hall, start=start + timedelta(hours=1), status=EventStatus.SUBMITTED,
               title="Dance Workshop")
        booked(club, hall, start=f.slot(days=30, hour=17), title="Next month")
        self.day = start.date()
        f.user("society@college.edu", global_roles=[R.CULTURAL_SOCIETY], mfa=True)
        f.student("student@college.edu", prn="23CS1009")

    def test_the_cultural_society_reads_a_week_with_its_clash(self):
        f.as_user(self.client, "society@college.edu", mfa_code="1")
        response = self.client.get("/api/v1/venue-calendar",
                                   {"from": self.day.isoformat(),
                                    "to": (self.day + timedelta(days=6)).isoformat()})
        self.assertEqual(response.status_code, 200)
        titles = {b["title"]: b["clash"] for b in response.data["bookings"]}
        self.assertEqual(titles, {"Open Mic": True, "Dance Workshop": True})
        self.assertEqual(len(response.data["clashes"]), 1)
        self.assertEqual(response.data["buffer_minutes"], 0)

    def test_a_student_is_refused(self):
        f.as_user(self.client, "student@college.edu")
        self.assertEqual(self.client.get("/api/v1/venue-calendar").status_code, 403)
