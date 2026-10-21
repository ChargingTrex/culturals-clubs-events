"""
Waitlist (PRD 5.6), registration notifications (PRD 5.5, 5.16.3) and the
roster-read audit (PRD §8), proven through the API with real tokens.
"""
from django.core import mail
from django.db import transaction
from django.db.models import ProtectedError
from django.test import TestCase
from rest_framework.test import APIClient

from common import roles as R
from events.models import EventStatus
from governance.models import AuditEntry, Notification
from participation import services
from participation.models import Registration, ScanRecord, ScanResult
from tests import factories as f


class WaitlistTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.venue = f.venue()
        self.club = f.club("Lens")
        self.president = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        self.event = f.event(self.club, self.venue, days=0, status=EventStatus.LIVE,
                             capacity=1)
        self.first = f.student("first@college.edu", prn="23CS1002", name="First In")
        self.second = f.student("second@college.edu", prn="23CS1003", name="Second In")
        self.third = f.student("third@college.edu", prn="23CS1004", name="Third In")
        self.holder = services.register_student(self.event, self.first)
        mail.outbox.clear()

    def register(self, email):
        f.as_user(self.client, email)
        return self.client.post("/api/v1/participation/registrations",
                                {"event": str(self.event.id)}, format="json")

    def test_a_full_event_waitlists_instead_of_refusing(self):
        response = self.register("second@college.edu")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data["waitlisted"])
        self.assertIsNone(response.data["pass_token"], "a waitlisted row holds no pass")
        registration = Registration.objects.get(event=self.event, student=self.second)
        self.assertTrue(registration.waitlisted)
        self.assertIsNone(services.live_pass(registration))
        self.assertEqual(services.confirmed_count(self.event), 1,
                         "a queue entry is not a place")

    def test_cancelling_promotes_the_earliest_waitlisted_student(self):
        self.register("second@college.edu")
        mail.outbox.clear()
        f.as_user(self.client, "first@college.edu")
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(
                f"/api/v1/participation/registrations/{self.holder.id}/cancel", format="json")
        self.assertEqual(response.status_code, 204)
        promoted = Registration.objects.get(event=self.event, student=self.second)
        self.assertFalse(promoted.waitlisted)
        event_pass = services.live_pass(promoted)
        self.assertIsNotNone(event_pass, "promotion mints the pass")
        note = Notification.objects.get(user=self.second.user, kind="registration.promoted")
        self.assertIn(str(event_pass.id), note.body)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["second@college.edu"])

    def test_promotion_is_first_in_first_out(self):
        self.register("second@college.edu")
        self.register("third@college.edu")
        services.cancel_registration(self.holder)
        second = Registration.objects.get(event=self.event, student=self.second)
        third = Registration.objects.get(event=self.event, student=self.third)
        self.assertFalse(second.waitlisted)
        self.assertTrue(third.waitlisted, "only one place freed, so only the head moves")
        services.cancel_registration(second)
        third.refresh_from_db()
        self.assertFalse(third.waitlisted)

    def test_cancelling_twice_is_a_no_op_and_promotes_once(self):
        self.register("second@college.edu")
        self.register("third@college.edu")
        services.cancel_registration(self.holder)
        first_time = Registration.objects.get(pk=self.holder.pk).cancelled_at
        services.cancel_registration(self.holder)
        self.assertEqual(Registration.objects.get(pk=self.holder.pk).cancelled_at, first_time,
                         "a second cancel must not rewrite history")
        self.assertTrue(Registration.objects.get(event=self.event, student=self.third)
                        .waitlisted, "a second cancel must not promote a second student")
        self.assertEqual(services.confirmed_count(self.event), 1)

    def test_a_waitlisted_student_cannot_reissue_a_pass(self):
        """A pass is a working credential; a queue entry holds no place to credential."""
        self.register("second@college.edu")
        queued = Registration.objects.get(event=self.event, student=self.second)
        response = self.client.post(
            f"/api/v1/participation/registrations/{queued.id}/reissue-pass", format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "PARTICIPATION_WAITLISTED")
        self.assertIsNone(services.live_pass(queued))

    def test_cancelling_a_waitlisted_registration_promotes_nobody(self):
        self.register("second@college.edu")
        self.register("third@college.edu")
        second = Registration.objects.get(event=self.event, student=self.second)
        services.cancel_registration(second)
        third = Registration.objects.get(event=self.event, student=self.third)
        self.assertTrue(third.waitlisted, "no place was freed")

    def test_a_student_cannot_promote_anyone(self):
        """
        Promotion only follows the holder cancelling their own registration.
        Another student cancelling it — the only way to force a promotion —
        gets 404, and the queue does not move.
        """
        self.register("second@college.edu")
        f.as_user(self.client, "third@college.edu")
        response = self.client.post(
            f"/api/v1/participation/registrations/{self.holder.id}/cancel", format="json")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["code"], "NOT_FOUND")
        self.holder.refresh_from_db()
        self.assertIsNone(self.holder.cancelled_at)
        self.assertTrue(Registration.objects.get(event=self.event, student=self.second)
                        .waitlisted)
        # Nor the club's president: a registration belongs to the student.
        f.as_user(self.client, "pres@college.edu")
        response = self.client.post(
            f"/api/v1/participation/registrations/{self.holder.id}/cancel", format="json")
        self.assertEqual(response.status_code, 404)

    def test_a_waitlisted_student_is_not_registered_at_the_door(self):
        self.register("second@college.edu")
        outcome = services.resolve(services.profile_token_for(self.second).token, self.event,
                                   operator=self.president.user, station_id="GATE-1")
        self.assertEqual(outcome.result, ScanResult.NOT_REGISTERED)
        self.assertIsNone(outcome.registration)
        registration = Registration.objects.get(event=self.event, student=self.second)
        self.assertTrue(registration.waitlisted)
        self.assertFalse(registration.attended)
        self.assertEqual(ScanRecord.objects.filter(event=self.event).count(), 1,
                         "every scan writes a record, this refusal included")

    def test_a_freed_place_goes_to_the_queue_head_and_the_door_admits_only_into_space(self):
        """
        Two places, two holders, two in the queue. A cancel promotes the head
        (FIFO); the next in line is still refused at the door; once the
        organiser raises capacity, the door admits them from the queue.
        """
        event = f.event(self.club, f.venue("Hall", 100), days=0, title="Two seats",
                        status=EventStatus.LIVE, capacity=2)
        holder_a = services.register_student(event, self.first)
        services.register_student(event, f.student("b@college.edu", prn="23CS1008"))
        services.register_student(event, self.second)   # queue head
        services.register_student(event, self.third)    # next in line
        services.cancel_registration(holder_a)
        self.assertFalse(Registration.objects.get(event=event, student=self.second).waitlisted)
        self.assertTrue(Registration.objects.get(event=event, student=self.third).waitlisted)

        third_qr = services.profile_token_for(self.third).token
        refused = services.resolve(third_qr, event, operator=self.president.user,
                                   station_id="GATE-1")
        self.assertEqual(refused.result, ScanResult.NOT_REGISTERED)
        self.assertIn("waitlist", refused.detail)

        event.capacity = 3
        event.save(update_fields=["capacity", "updated_at"])
        admitted = services.resolve(third_qr, event, operator=self.president.user,
                                    station_id="GATE-1")
        self.assertEqual(admitted.result, ScanResult.SPOT_REGISTERED)
        registration = Registration.objects.get(event=event, student=self.third)
        self.assertFalse(registration.waitlisted)
        self.assertTrue(registration.attended)
        self.assertEqual(ScanRecord.objects.filter(event=event).count(), 2)

    def test_my_passes_lists_the_waitlisted_registration_without_a_pass(self):
        self.register("second@college.edu")
        response = self.client.get("/api/v1/participation/my-passes")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["passes"]), 1)
        entry = response.data["passes"][0]
        self.assertTrue(entry["waitlisted"])
        self.assertIsNone(entry["token"])
        self.assertIsNone(entry["image"])

    def test_the_partial_unique_index_still_holds_for_a_waitlisted_student(self):
        self.register("second@college.edu")
        response = self.register("second@college.edu")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "PARTICIPATION_ALREADY_REGISTERED")


class RegistrationNotificationTests(TestCase):
    """
    Every send is deferred to commit (transaction.on_commit), so the tests run
    the callbacks explicitly — and prove a rollback sends nothing.
    """

    def setUp(self):
        self.client = APIClient()
        self.venue = f.venue()
        self.club = f.club("Lens")
        self.event = f.event(self.club, self.venue, days=3, status=EventStatus.PUBLISHED,
                             capacity=10)
        self.student = f.student("att@college.edu", prn="23CS1002", name="Meera A")
        mail.outbox.clear()

    def test_registering_queues_an_in_app_notification_and_an_email_naming_the_pass(self):
        f.as_user(self.client, "att@college.edu")
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post("/api/v1/participation/registrations",
                                        {"event": str(self.event.id)}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        registration = Registration.objects.get(pk=response.data["id"])
        event_pass = services.live_pass(registration)
        note = Notification.objects.get(user=self.student.user, kind="registration.confirmed")
        self.assertIn(str(event_pass.id), note.body)
        self.assertIn(self.event.title, note.subject)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["att@college.edu"])
        self.assertIn(str(event_pass.id), mail.outbox[0].body)

    def test_nothing_is_sent_before_commit(self):
        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            services.register_student(self.event, self.student)
            self.assertEqual(len(mail.outbox), 0)
            self.assertFalse(Notification.objects.filter(user=self.student.user).exists())
        self.assertEqual(len(callbacks), 1)

    def test_joining_the_waitlist_is_also_confirmed(self):
        full = f.event(self.club, f.venue("Music Room", 40), days=4, title="Full",
                       status=EventStatus.PUBLISHED, capacity=1)
        services.register_student(full, f.student("x@college.edu", prn="23CS1009"))
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            services.register_student(full, self.student)
        self.assertTrue(Notification.objects.filter(
            user=self.student.user, kind="registration.waitlisted").exists())
        self.assertEqual(len(mail.outbox), 1)

    def test_publication_notifies_the_registered_students(self):
        """
        Publication is governance's save of Event.status; participation hears it
        through the save signal, so the registration rows here are created
        directly — registration is not open before publication.
        """
        pending = f.event(self.club, f.venue("Hall", 100), days=5, title="Pending",
                          status=EventStatus.APPROVED)
        Registration.objects.create(event=pending, student=self.student)
        bystander = f.student("else@college.edu", prn="23CS1003")
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            pending.status = EventStatus.PUBLISHED
            pending.save(update_fields=["status", "updated_at"])
        self.assertTrue(Notification.objects.filter(
            user=self.student.user, kind="event.published").exists())
        self.assertFalse(Notification.objects.filter(user=bystander.user).exists())
        self.assertEqual(len(mail.outbox), 1)
        # Saving again without a status change sends nothing.
        with self.captureOnCommitCallbacks(execute=True):
            pending.save(update_fields=["status", "updated_at"])
        self.assertEqual(len(mail.outbox), 1)

    def test_a_rolled_back_publication_tells_nobody(self):
        """
        governance.decide saves the event and then the budget in one
        transaction; if the second save fails, the first is undone — and so must
        the email be.
        """
        pending = f.event(self.club, f.venue("Hall", 100), days=5, title="Pending",
                          status=EventStatus.APPROVED)
        Registration.objects.create(event=pending, student=self.student)
        with self.captureOnCommitCallbacks(execute=True):
            with self.assertRaises(RuntimeError), transaction.atomic():
                pending.status = EventStatus.PUBLISHED
                pending.save(update_fields=["status", "updated_at"])
                raise RuntimeError("a later save in the same transaction failed")
        self.assertEqual(mail.outbox, [])
        self.assertFalse(Notification.objects.filter(user=self.student.user).exists())
        self.assertEqual(Registration.objects.get(student=self.student).event.status,
                         EventStatus.APPROVED)

    def test_a_venue_move_notifies_the_registered_students(self):
        services.register_student(self.event, self.student)
        mail.outbox.clear()
        with self.captureOnCommitCallbacks(execute=True):
            self.event.venue = f.venue("Hall", 100)
            self.event.save(update_fields=["venue", "updated_at"])
        note = Notification.objects.get(user=self.student.user, kind="event.venue_changed")
        self.assertIn("Hall", note.body)
        self.assertEqual(len(mail.outbox), 1)


class RosterAuditTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.club = f.club("Lens")
        self.president = f.student("pres@college.edu", prn="23CS1001", name="Pres")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        self.event = f.event(self.club, f.venue(), days=0, status=EventStatus.LIVE)
        services.register_student(self.event, f.student("a@college.edu", prn="23CS1002"))
        services.register_student(self.event, f.student("b@college.edu", prn="23CS1003"))

    def test_reading_a_roster_writes_an_audit_entry_naming_the_reader(self):
        f.as_user(self.client, "pres@college.edu")
        response = self.client.get(f"/api/v1/participation/events/{self.event.id}/roster")
        self.assertEqual(response.status_code, 200)
        entry = AuditEntry.objects.get(action="roster.read")
        self.assertEqual(entry.actor_sub, str(self.president.user.id))
        self.assertEqual(entry.target_type, "Event")
        self.assertEqual(entry.target_id, str(self.event.id))
        self.assertEqual(entry.after["rows"], 2)

    def test_a_refused_read_leaves_no_entry(self):
        f.as_user(self.client, "a@college.edu")
        response = self.client.get(f"/api/v1/participation/events/{self.event.id}/roster")
        self.assertEqual(response.status_code, 404)
        self.assertFalse(AuditEntry.objects.filter(action="roster.read").exists())


class ExternalPurgeTests(TestCase):
    """
    Decision E-09: an external participant is purged by blanking, never by
    deleting their registration — the registration is a figure in a report
    that has already been read.
    """

    def setUp(self):
        self.semester = f.semester()
        self.club = f.club("Lens")
        self.event = f.event(self.club, f.venue("Fest Hall", 500), title="Fest", days=-1,
                             status=EventStatus.REPORTED)

    def test_a_purged_external_participant_still_counts_in_the_semester_report(self):
        from django.utils import timezone

        from participation.models import ExternalParticipant
        from reporting.services import semester_report

        guest = ExternalParticipant.objects.create(full_name="Outside Guest",
                                                   institution="Another College",
                                                   email="guest@example.com")
        registration = Registration.objects.create(event=self.event, external=guest,
                                                   attended=True,
                                                   checked_in_at=self.event.starts_at)
        guest.full_name = guest.institution = guest.email = guest.phone = ""
        guest.purged_at = timezone.now()
        guest.save()
        report = semester_report(self.semester)
        self.assertEqual(report["external_participants"], 1)
        self.assertEqual(report["unique_students"], 0)
        registration.refresh_from_db()
        self.assertEqual(registration.participant_label, "External participant (purged)")
        with self.assertRaises(ProtectedError):
            guest.delete()
        self.assertTrue(Registration.objects.filter(pk=registration.pk).exists())
