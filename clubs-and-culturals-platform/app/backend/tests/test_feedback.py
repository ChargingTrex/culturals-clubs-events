"""
Post-event feedback (PRD 5.8): attendees only, once, and organisers see
aggregates with no identities.
"""
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from common import roles as R
from events.models import EventStatus
from feedback.models import Feedback
from participation import services
from participation.models import Registration
from tests import factories as f


class _ClosedEventFixture(TestCase):
    """A completed event with one attendee and one no-show. Holds no tests."""

    def setUp(self):
        self.client = APIClient()
        self.club = f.club("Lens")
        self.president = f.student("pres@college.edu", prn="23CS1001", name="Pres")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        self.treasurer = f.student("treas@college.edu", prn="23CS1005", name="Treas")
        f.member(self.club, self.treasurer, R.CLUB_TREASURER)
        self.member = f.student("member@college.edu", prn="23CS1006", name="Member")
        f.member(self.club, self.member, R.CLUB_MEMBER)
        f.user("dean@college.edu", global_roles=[R.DEAN], mfa=True)
        f.user("vc@college.edu", global_roles=[R.VICE_CHANCELLOR], mfa=True)
        f.user("society@college.edu", global_roles=[R.CULTURAL_SOCIETY], mfa=True)
        self.event = f.event(self.club, f.venue(), days=0, status=EventStatus.LIVE)
        self.attendee = f.student("att@college.edu", prn="23CS1002", name="Meera Attended")
        self.absentee = f.student("abs@college.edu", prn="23CS1003", name="Rohan Absent")
        services.register_student(self.event, self.attendee)
        services.register_student(self.event, self.absentee)
        services.check_in_manually(self.event, self.attendee, operator=self.president.user)
        self.event.status = EventStatus.COMPLETED
        self.event.save(update_fields=["status", "updated_at"])
        self.url = f"/api/v1/feedback/events/{self.event.id}"

    def submit(self, email, **body):
        f.as_user(self.client, email)
        payload = {"rating": 4, "would_recommend": True, "comment": "Loved the lighting"}
        payload.update(body)
        return self.client.post(self.url, payload, format="json")


class FeedbackTests(_ClosedEventFixture):
    def test_an_attendee_can_submit_once(self):
        response = self.submit("att@college.edu")
        self.assertEqual(response.status_code, 201, response.data)
        row = Feedback.objects.get(event=self.event, student=self.attendee)
        self.assertEqual(row.rating, 4)
        self.assertEqual(row.registration,
                         Registration.objects.get(event=self.event, student=self.attendee))

    def test_a_second_submission_is_a_conflict(self):
        self.submit("att@college.edu")
        response = self.submit("att@college.edu", rating=2)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "FEEDBACK_ALREADY_SUBMITTED")
        self.assertEqual(Feedback.objects.filter(event=self.event).count(), 1)

    def test_a_registered_but_absent_student_is_refused(self):
        """Rule 6: registered is not attended, and only attendance earns a say."""
        response = self.submit("abs@college.edu")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "FEEDBACK_NOT_ATTENDED")

    def test_a_stranger_and_a_non_student_are_refused(self):
        self.assertEqual(self.submit("member@college.edu").status_code, 403)
        f.as_user(self.client, "dean@college.edu", mfa_code="1")
        response = self.client.post(self.url, {"rating": 5, "would_recommend": True},
                                    format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "FEEDBACK_NOT_ATTENDED")

    def test_feedback_waits_for_the_event_to_close(self):
        self.event.status = EventStatus.LIVE
        self.event.save(update_fields=["status", "updated_at"])
        response = self.submit("att@college.edu")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "FEEDBACK_NOT_OPEN")

    def test_a_rating_outside_1_to_5_fails_validation(self):
        response = self.submit("att@college.edu", rating=6)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data["code"], "VALIDATION_FAILED")
        self.assertEqual(response.data["errors"][0]["field"], "rating")
        self.assertEqual(self.submit("att@college.edu", rating=0).status_code, 422)

    def test_the_database_refuses_a_rating_of_6(self):
        registration = Registration.objects.get(event=self.event, student=self.attendee)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Feedback.objects.create(event=self.event, registration=registration,
                                    student=self.attendee, rating=6, would_recommend=True)

    def test_the_database_refuses_a_second_row_per_student_per_event(self):
        registration = Registration.objects.get(event=self.event, student=self.attendee)
        Feedback.objects.create(event=self.event, registration=registration,
                                student=self.attendee, rating=3, would_recommend=False)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Feedback.objects.create(event=self.event, registration=registration,
                                    student=self.attendee, rating=5, would_recommend=True)


class FeedbackSummaryTests(_ClosedEventFixture):
    def setUp(self):
        super().setUp()
        self.submit("att@college.edu", rating=4, comment="Loved the lighting")
        second = f.student("two@college.edu", prn="23CS1004", name="Second Attended")
        Registration.objects.create(event=self.event, student=second, attended=True,
                                    checked_in_at=timezone.now())
        self.submit("two@college.edu", rating=2, would_recommend=False, comment="")
        self.summary_url = f"/api/v1/feedback/events/{self.event.id}/summary"

    def test_the_organiser_gets_aggregates_and_no_identifiers(self):
        f.as_user(self.client, "pres@college.edu")
        response = self.client.get(self.summary_url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(response.data["average_rating"], 3.0)
        self.assertEqual(response.data["recommend_rate"], 0.5)
        self.assertEqual(response.data["comments"], ["Loved the lighting"])
        body = response.content.decode()
        for leak in ("23CS1002", "23CS1004", "Meera", "Second Attended", "att@college.edu",
                     str(self.attendee.id), *(str(r) for r in Feedback.objects.filter(
                         event=self.event).values_list("id", flat=True))):
            self.assertNotIn(leak, body, f"summary leaked {leak}")
        for key in ("student", "prn", "full_name", "registration"):
            self.assertNotIn(key, body)

    def test_the_treasurer_dean_society_and_admin_may_read_it(self):
        f.user("admin@college.edu", global_roles=[R.ADMIN], mfa=True)
        for email in ("treas@college.edu",):
            f.as_user(self.client, email)
            self.assertEqual(self.client.get(self.summary_url).status_code, 200, email)
        for email in ("dean@college.edu", "society@college.edu", "admin@college.edu"):
            f.as_user(self.client, email, mfa_code="1")
            self.assertEqual(self.client.get(self.summary_url).status_code, 200, email)

    def test_a_member_and_the_vice_chancellor_get_404_not_403(self):
        f.as_user(self.client, "member@college.edu")
        response = self.client.get(self.summary_url)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["code"], "NOT_FOUND")
        f.as_user(self.client, "att@college.edu")
        self.assertEqual(self.client.get(self.summary_url).status_code, 404)
        f.as_user(self.client, "vc@college.edu", mfa_code="1")
        self.assertEqual(self.client.get(self.summary_url).status_code, 404)

    def test_another_clubs_president_gets_404(self):
        rival = f.student("rival@college.edu", prn="23CS1007")
        f.member(f.club("Swara"), rival, R.CLUB_PRESIDENT)
        f.as_user(self.client, "rival@college.edu")
        self.assertEqual(self.client.get(self.summary_url).status_code, 404)

    def test_an_empty_summary_has_null_averages(self):
        other = f.event(self.club, f.venue("Hall", 100), days=1, title="Quiet",
                        status=EventStatus.COMPLETED)
        f.as_user(self.client, "pres@college.edu")
        response = self.client.get(f"/api/v1/feedback/events/{other.id}/summary")
        self.assertEqual(response.data, {"event": {"id": str(other.id), "title": "Quiet"},
                                         "count": 0, "average_rating": None,
                                         "recommend_rate": None, "comments": []})
