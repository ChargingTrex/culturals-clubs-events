"""
Joining a club (PRD §5.2), the roster, and dormancy (PRD §5.1).

An open club admits on request; an approval club queues the request for the
President or Vice-President. The Treasurer cannot decide a request, exactly as
they cannot assign a role (AGENT_PROMPT §6), and a member of another club
cannot even see the queue.
"""
from datetime import timedelta

from django.core import mail
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from clubs.models import Club, JoinRequest, Membership
from clubs.services import flag_dormant, touch_activity
from common import roles as R
from events.models import EventStatus
from governance import services as governance
from governance.models import AuditEntry, Notification
from tests import factories as f


class JoinTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.swara = f.club("Swara")                       # approval (the default)
        self.natya = f.club("Natya")
        self.natya.join_mode = Club.JoinMode.OPEN
        self.natya.save(update_fields=["join_mode"])
        self.president = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.swara, self.president, R.CLUB_PRESIDENT)
        self.vp = f.student("vp@college.edu", prn="23CS1005")
        f.member(self.swara, self.vp, R.CLUB_VICE_PRESIDENT)
        self.treasurer = f.student("treas@college.edu", prn="23CS1002")
        f.member(self.swara, self.treasurer, R.CLUB_TREASURER)
        self.member = f.student("member@college.edu", prn="23CS1006")
        f.member(self.swara, self.member, R.CLUB_MEMBER)
        self.natya_pres = f.student("natya@college.edu", prn="23CS1003")
        f.member(self.natya, self.natya_pres, R.CLUB_PRESIDENT)
        self.applicant = f.student("new@college.edu", prn="23CS1004", name="Meera N")
        f.user("dean@college.edu", global_roles=[R.DEAN], mfa=True)

    def join(self, email, club):
        f.as_user(self.client, email)
        return self.client.post(f"/api/v1/clubs/{club.id}/join", {}, format="json")

    def queue(self, email):
        f.as_user(self.client, email)
        return self.client.get(f"/api/v1/clubs/{self.swara.id}/join-requests")

    def decide(self, email, join_request, outcome, note=""):
        f.as_user(self.client, email)
        return self.client.post(
            f"/api/v1/clubs/{self.swara.id}/join-requests/{join_request.id}/{outcome}",
            {"note": note}, format="json")

    def pending(self):
        self.join("new@college.edu", self.swara)
        return JoinRequest.objects.get(student=self.applicant, club=self.swara)

    def test_an_open_club_admits_immediately(self):
        response = self.join("new@college.edu", self.natya)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["role"], R.CLUB_MEMBER)
        membership = Membership.objects.get(club=self.natya, student=self.applicant)
        self.assertTrue(membership.is_active)
        self.assertFalse(JoinRequest.objects.exists())

    def test_an_approval_club_queues_the_request(self):
        response = self.join("new@college.edu", self.swara)
        self.assertEqual(response.status_code, 202, response.data)
        self.assertEqual(response.data["state"], "pending")
        self.assertFalse(Membership.objects.filter(club=self.swara, student=self.applicant).exists())

    def test_a_second_request_while_one_is_pending_is_409(self):
        self.pending()
        response = self.join("new@college.edu", self.swara)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "CLUBS_JOIN_PENDING")
        self.assertEqual(JoinRequest.objects.count(), 1)

    def test_an_existing_member_cannot_join_again(self):
        response = self.join("member@college.edu", self.swara)
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "CLUBS_ALREADY_MEMBER")

    def test_staff_without_a_student_record_cannot_join(self):
        f.as_user(self.client, "dean@college.edu", mfa_code="1")
        response = self.client.post(f"/api/v1/clubs/{self.natya.id}/join", {}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_the_president_sees_the_queue(self):
        self.pending()
        response = self.queue("pres@college.edu")
        self.assertEqual(response.status_code, 200)
        self.assertEqual([r["prn"] for r in response.data["results"]], ["23CS1004"])

    def test_the_treasurer_cannot_read_the_queue(self):
        self.pending()
        response = self.queue("treas@college.edu")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "CLUBS_ROLE_ASSIGN_DENIED")

    def test_a_member_of_another_club_cannot_find_the_queue(self):
        self.pending()
        self.assertEqual(self.queue("natya@college.edu").status_code, 404)

    def test_the_applicant_cannot_read_the_queue_either(self):
        self.pending()
        self.assertEqual(self.queue("new@college.edu").status_code, 404)

    def test_accepting_creates_exactly_one_active_membership(self):
        request = self.pending()
        response = self.decide("pres@college.edu", request, "accept")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["state"], "accepted")
        active = Membership.objects.filter(club=self.swara, student=self.applicant,
                                           ended_at__isnull=True)
        self.assertEqual(active.count(), 1)
        self.assertEqual(active.get().role, R.CLUB_MEMBER)
        request.refresh_from_db()
        self.assertEqual(str(request.decided_by_id), str(self.president.user.id))
        self.assertIsNotNone(request.decided_at)

    def test_the_vice_president_may_accept_too(self):
        self.assertEqual(self.decide("vp@college.edu", self.pending(), "accept").status_code, 200)

    def test_the_treasurer_cannot_accept(self):
        request = self.pending()
        response = self.decide("treas@college.edu", request, "accept")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "CLUBS_ROLE_ASSIGN_DENIED")
        request.refresh_from_db()
        self.assertEqual(request.state, "pending", "nothing changed")
        self.assertFalse(Membership.objects.filter(club=self.swara, student=self.applicant).exists())

    def test_another_clubs_president_cannot_accept(self):
        self.assertEqual(self.decide("natya@college.edu", self.pending(), "accept").status_code, 404)

    def test_a_decided_request_cannot_be_decided_again(self):
        request = self.pending()
        self.decide("pres@college.edu", request, "accept")
        response = self.decide("pres@college.edu", request, "decline")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "CLUBS_JOIN_ALREADY_DECIDED")
        self.assertEqual(Membership.objects.filter(club=self.swara, student=self.applicant,
                                                   ended_at__isnull=True).count(), 1)

    def test_declining_records_the_note_and_creates_no_membership(self):
        request = self.pending()
        response = self.decide("pres@college.edu", request, "decline", note="Auditions closed")
        self.assertEqual(response.status_code, 200)
        request.refresh_from_db()
        self.assertEqual(request.state, "declined")
        self.assertEqual(request.note, "Auditions closed")
        self.assertFalse(Membership.objects.filter(club=self.swara, student=self.applicant).exists())

    def test_the_student_is_told_the_outcome_in_app_and_by_email(self):
        request = self.pending()
        mail.outbox.clear()
        self.decide("pres@college.edu", request, "accept")
        note = Notification.objects.filter(user=self.applicant.user, kind="club.join_accepted")
        self.assertEqual(note.count(), 1)
        self.assertIn("Swara", note.get().subject)
        self.assertEqual([m.to for m in mail.outbox], [["new@college.edu"]])

    def test_a_declined_student_is_told_too(self):
        request = self.pending()
        self.decide("pres@college.edu", request, "decline", note="Auditions closed")
        note = Notification.objects.get(user=self.applicant.user, kind="club.join_declined")
        self.assertIn("Auditions closed", note.body)

    def test_the_office_bearers_hear_of_a_new_request(self):
        self.pending()
        recipients = set(Notification.objects.filter(kind="club.join_requested")
                         .values_list("user__email", flat=True))
        self.assertEqual(recipients, {"pres@college.edu", "vp@college.edu"})

    def test_decisions_are_audited(self):
        request = self.pending()
        self.decide("pres@college.edu", request, "accept")
        entry = AuditEntry.objects.get(action="club.join_accepted", target_id=str(request.id))
        self.assertEqual(entry.actor_sub, str(self.president.user.id))

    def test_the_roster_shows_the_pending_count_to_officers_only(self):
        self.pending()
        f.as_user(self.client, "pres@college.edu")
        roster = self.client.get(f"/api/v1/clubs/{self.swara.id}/members").data
        self.assertEqual(roster["pending_join_requests"], 1)
        f.as_user(self.client, "member@college.edu")
        roster = self.client.get(f"/api/v1/clubs/{self.swara.id}/members").data
        self.assertNotIn("pending_join_requests", roster)

    def test_the_database_refuses_a_second_pending_request(self):
        from django.db import IntegrityError, transaction

        self.pending()
        with self.assertRaises(IntegrityError), transaction.atomic():
            JoinRequest.objects.create(club=self.swara, student=self.applicant)

    def test_the_club_payload_carries_the_join_mode(self):
        f.as_user(self.client, "new@college.edu")
        response = self.client.get(f"/api/v1/clubs/{self.natya.id}")
        self.assertEqual(response.data["join_mode"], "open")


class RosterAuditTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.club = f.club("Swara")
        self.president = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        f.member(self.club, f.student("m@college.edu", prn="23CS1002"), R.CLUB_MEMBER)

    def test_reading_the_roster_writes_an_audit_entry_naming_the_reader(self):
        f.as_user(self.client, "pres@college.edu")
        self.assertEqual(self.client.get(f"/api/v1/clubs/{self.club.id}/members").status_code, 200)
        entry = AuditEntry.objects.get(action="club.roster.read", target_id=str(self.club.id))
        self.assertEqual(entry.actor_sub, str(self.president.user.id))
        self.assertEqual(entry.after["rows"], 2)

    def test_a_refused_read_writes_nothing(self):
        f.student("x@college.edu", prn="23CS1009")
        f.as_user(self.client, "x@college.edu")
        self.assertEqual(self.client.get(f"/api/v1/clubs/{self.club.id}/members").status_code, 404)
        self.assertFalse(AuditEntry.objects.filter(action="club.roster.read").exists())


@override_settings(DORMANCY_DAYS=180)
class DormancyTests(TestCase):
    def setUp(self):
        self.now = timezone.now()
        self.quiet = f.club("Quiet")
        Club.objects.filter(pk=self.quiet.pk).update(last_activity_at=self.now - timedelta(days=200))
        self.busy = f.club("Busy")
        Club.objects.filter(pk=self.busy.pk).update(last_activity_at=self.now - timedelta(days=10))
        self.silent = f.club("Silent")      # never recorded anything
        Club.objects.filter(pk=self.silent.pk).update(last_activity_at=None,
                                                      created_at=self.now - timedelta(days=400))
        self.archived = f.club("Gone")
        Club.objects.filter(pk=self.archived.pk).update(status=Club.Status.ARCHIVED,
                                                        last_activity_at=self.now - timedelta(days=400))

    def status(self, club):
        return Club.objects.get(pk=club.pk).status

    def test_an_inactive_club_is_flagged_and_an_active_one_untouched(self):
        flagged = flag_dormant(self.now)
        self.assertEqual({c.name for c in flagged}, {"Quiet", "Silent"})
        self.assertEqual(self.status(self.quiet), Club.Status.DORMANT)
        self.assertEqual(self.status(self.silent), Club.Status.DORMANT)
        self.assertEqual(self.status(self.busy), Club.Status.ACTIVE)
        self.assertEqual(self.status(self.archived), Club.Status.ARCHIVED, "archived is not active")

    def test_flagging_is_audited_and_idempotent(self):
        flag_dormant(self.now)
        self.assertEqual(AuditEntry.objects.filter(action="club.flagged_dormant").count(), 2)
        self.assertEqual(flag_dormant(self.now), [])

    def test_the_threshold_comes_from_settings(self):
        with override_settings(DORMANCY_DAYS=5):
            flagged = flag_dormant(self.now)
        self.assertIn(self.busy.pk, {c.pk for c in flagged})

    def test_the_management_command_runs_the_job(self):
        call_command("flag_dormant_clubs")
        self.assertEqual(self.status(self.quiet), Club.Status.DORMANT)
        self.assertEqual(self.status(self.busy), Club.Status.ACTIVE)

    def test_a_new_event_submission_reactivates_the_club(self):
        flag_dormant(self.now)
        self.assertEqual(self.status(self.quiet), Club.Status.DORMANT)
        f.semester()
        hall = f.venue("Seminar Hall A", 150)
        president = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.quiet, president, R.CLUB_PRESIDENT)
        event = f.event(self.quiet, hall, days=7)
        f.budget(event, amounts=(5000,))
        governance.submit(event, actor=f.ctx_for(president.user))
        club = Club.objects.get(pk=self.quiet.pk)
        self.assertEqual(club.status, Club.Status.ACTIVE)
        self.assertGreater(club.last_activity_at, self.now - timedelta(minutes=1))
        self.assertTrue(AuditEntry.objects.filter(action="club.reactivated",
                                                  target_id=str(club.pk)).exists())

    def test_publication_and_close_count_as_activity(self):
        """The hook is on the status change, whichever code path makes it."""
        hall = f.venue("Seminar Hall A", 150)
        before = Club.objects.get(pk=self.busy.pk).last_activity_at
        event = f.event(self.busy, hall, days=7, status=EventStatus.SUBMITTED)
        event.status = EventStatus.PUBLISHED
        event.save(update_fields=["status", "updated_at"])
        self.assertGreater(Club.objects.get(pk=self.busy.pk).last_activity_at, before)

    def test_a_draft_is_not_activity(self):
        hall = f.venue("Seminar Hall A", 150)
        before = Club.objects.get(pk=self.busy.pk).last_activity_at
        f.event(self.busy, hall, days=7, status=EventStatus.DRAFT)
        self.assertEqual(Club.objects.get(pk=self.busy.pk).last_activity_at, before)

    def test_a_membership_change_is_activity(self):
        client = APIClient()
        flag_dormant(self.now)
        president = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.quiet, president, R.CLUB_PRESIDENT)
        target = f.member(self.quiet, f.student("t@college.edu", prn="23CS1002"))
        f.as_user(client, "pres@college.edu")
        response = client.post(f"/api/v1/memberships/{target.id}/role",
                               {"role": R.CLUB_CORE}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.status(self.quiet), Club.Status.ACTIVE)

    def test_touch_activity_flips_dormant_back(self):
        flag_dormant(self.now)
        touch_activity(self.quiet)
        self.assertEqual(self.status(self.quiet), Club.Status.ACTIVE)
