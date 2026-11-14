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
        f.user("society@college.edu", global_roles=[R.SOCIETY_SECRETARY], mfa=True)
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

    def test_a_president_sees_the_calendar_but_not_another_clubs_pending_title(self):
        """AR-02: every taken slot is visible; what another club is pitching is not."""
        mine = f.club("Natya")
        hall = f.venue("Seminar Hall B", 100)
        booked(mine, hall, start=f.slot(days=3, hour=10), status=EventStatus.SUBMITTED,
               title="Our pitch")
        pres = f.student("pres@college.edu", prn="23CS1010")
        f.member(mine, pres, R.CLUB_PRESIDENT)
        f.as_user(self.client, "pres@college.edu")
        response = self.client.get("/api/v1/venue-calendar",
                                   {"from": self.day.isoformat(),
                                    "to": (self.day + timedelta(days=6)).isoformat()})
        self.assertEqual(response.status_code, 200)
        shown = sorted((b["title"], b["club"]) for b in response.data["bookings"])
        self.assertEqual(shown, [("Our pitch", "Natya"), ("Requested", ""), ("Requested", "")])
        self.assertNotIn("Open Mic", response.content.decode())

    def test_a_vice_president_sees_the_calendar_and_cannot_move_a_booking(self):
        """AR-02: a VP stands in for the President: reads the calendar, moves nothing."""
        mine = f.club("Natya")
        hall = f.venue("Seminar Hall B", 100)
        start = f.slot(days=3, hour=10)
        event = booked(mine, hall, start=start, title="Our show")
        vp = f.student("vp@college.edu", prn="23CS1012")
        f.member(mine, vp, R.CLUB_VICE_PRESIDENT)
        f.as_user(self.client, "vp@college.edu")
        response = self.client.get("/api/v1/venue-calendar",
                                   {"from": self.day.isoformat(),
                                    "to": (self.day + timedelta(days=6)).isoformat()})
        self.assertEqual(response.status_code, 200)
        self.assertIn(("Our show", "Natya"),
                      [(b["title"], b["club"]) for b in response.data["bookings"]])
        moved = self.client.post(
            f"/api/v1/events/{event.id}/reassign",
            {"starts_at": (start + timedelta(hours=2)).isoformat(),
             "ends_at": (start + timedelta(hours=3)).isoformat(),
             "reason": "We would like a later hour"}, format="json")
        self.assertEqual(moved.status_code, 403)
        self.assertEqual(moved.data["code"], "EVENTS_REASSIGN_DENIED")
        patched = self.client.patch(
            f"/api/v1/events/{event.id}",
            {"starts_at": (start + timedelta(hours=2)).isoformat(),
             "ends_at": (start + timedelta(hours=3)).isoformat()}, format="json")
        self.assertEqual(patched.status_code, 409)
        event.refresh_from_db()
        self.assertEqual(event.starts_at, start)

    def test_a_treasurer_is_refused(self):
        treas = f.student("treas@college.edu", prn="23CS1011")
        f.member(f.club("Lens"), treas, R.CLUB_TREASURER)
        f.as_user(self.client, "treas@college.edu")
        self.assertEqual(self.client.get("/api/v1/venue-calendar").status_code, 403)


class DeanMoveTests(TestCase):
    """AR-02: only the Dean moves a booking, to a new time and/or venue."""

    def setUp(self):
        self.client = APIClient()
        self.club, self.hall = f.club("Swara"), f.venue("Seminar Hall A", 150)
        self.other = f.venue("Seminar Hall B", 150)
        self.start = f.slot(days=5, hour=17)
        self.event = booked(self.club, self.hall, start=self.start, title="Open Mic")
        f.user("dean@college.edu", global_roles=[R.DEAN], mfa=True)
        pres = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, pres, R.CLUB_PRESIDENT)

    def move(self, email="dean@college.edu", **body):
        f.as_user(self.client, email, mfa_code="1" if email.startswith("dean") else "")
        body.setdefault("reason", "Convocation rehearsal needs the hall")
        return self.client.post(f"/api/v1/events/{self.event.id}/reassign", body, format="json")

    def test_the_dean_moves_the_time_and_venue_together(self):
        new = self.start + timedelta(days=1, hours=-2)
        response = self.move(to_venue=str(self.other.id), starts_at=new.isoformat(),
                             ends_at=(new + timedelta(hours=1)).isoformat())
        self.assertEqual(response.status_code, 200, response.data)
        self.event.refresh_from_db()
        self.assertEqual((self.event.venue, self.event.starts_at), (self.other, new))

    def test_the_dean_moves_only_the_time(self):
        new = self.start + timedelta(hours=2)
        response = self.move(starts_at=new.isoformat(), ends_at=(new + timedelta(hours=2)).isoformat())
        self.assertEqual(response.status_code, 200, response.data)
        self.event.refresh_from_db()
        self.assertEqual((self.event.venue, self.event.starts_at), (self.hall, new))

    def test_a_president_cannot_move_their_own_event(self):
        new = self.start + timedelta(hours=2)
        response = self.move("pres@college.edu", starts_at=new.isoformat(),
                             ends_at=(new + timedelta(hours=1)).isoformat())
        self.assertEqual(response.status_code, 403)

    def test_a_move_into_a_taken_hour_is_refused(self):
        taken = f.slot(days=6, hour=11)
        booked(f.club("Natya"), self.hall, start=taken, title="Taken")
        response = self.move(starts_at=taken.isoformat(),
                             ends_at=(taken + timedelta(hours=1)).isoformat())
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "EVENTS_VENUE_UNAVAILABLE")

    def test_a_half_hour_is_refused(self):
        new = self.start + timedelta(minutes=30)
        response = self.move(starts_at=new.isoformat(), ends_at=(new + timedelta(hours=1)).isoformat())
        self.assertEqual(response.status_code, 422)

    def test_nothing_to_change_is_refused(self):
        self.assertEqual(self.move().status_code, 422)

