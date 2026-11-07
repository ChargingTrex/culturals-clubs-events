"""
Check-in resolution: the seven branches, and the offline conflict rule.

AGENT_PROMPT: "every figure management ever sees derives from attendance records.
If attendance capture is unreliable, nothing else in the system matters." These are
the tests that hold that up.
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from common import roles as R
from events.models import EventStatus
from participation import services
from participation.models import Registration, ScanRecord, ScanResult
from qrkit import tokens as qr
from tests import factories as f


class SevenBranchTests(TestCase):
    def setUp(self):
        self.venue = f.venue()
        self.club = f.club("Lens")
        self.organiser = f.student("org@college.edu", prn="23CS1001", name="Gokul O")
        f.member(self.club, self.organiser, R.CLUB_PRESIDENT)
        self.event = f.event(self.club, self.venue, days=0, status=EventStatus.LIVE,
                             capacity=3)
        self.other_event = f.event(self.club, f.venue("Music Room", 40), days=3,
                                   title="Other", status=EventStatus.PUBLISHED)
        self.attendee = f.student("att@college.edu", prn="23CS1002", name="Meera A")
        self.walkin = f.student("walk@college.edu", prn="23CS1003", name="Rohan W")
        self.operator = self.organiser.user

    def scan(self, token, **kw):
        return services.resolve(token, self.event, operator=self.operator,
                                station_id="GATE-1", **kw)

    def test_branch_1_valid_pass_is_accepted(self):
        reg = services.register_student(self.event, self.attendee)
        outcome = self.scan(services.live_pass(reg).token)
        self.assertEqual(outcome.result, ScanResult.ACCEPTED)
        reg.refresh_from_db()
        self.assertTrue(reg.attended)
        self.assertEqual(reg.station_id, "GATE-1")
        self.assertEqual(reg.checked_in_by, self.operator)

    def test_branch_2_the_same_pass_twice_is_a_duplicate(self):
        reg = services.register_student(self.event, self.attendee)
        token = services.live_pass(reg).token
        self.scan(token)
        outcome = self.scan(token)
        self.assertEqual(outcome.result, ScanResult.DUPLICATE)
        self.assertEqual(outcome.tone, "warn", "a duplicate is not an error, it is a fact")
        self.assertIn("First scanned at", outcome.detail)

    def test_branch_3_profile_qr_of_a_registered_student_is_accepted(self):
        reg = services.register_student(self.event, self.attendee)
        profile = services.profile_token_for(self.attendee)
        outcome = self.scan(profile.token)
        self.assertEqual(outcome.result, ScanResult.ACCEPTED)
        reg.refresh_from_db()
        self.assertTrue(reg.attended)

    def test_branch_4_profile_qr_of_a_walk_in_registers_and_admits(self):
        profile = services.profile_token_for(self.walkin)
        outcome = self.scan(profile.token)
        self.assertEqual(outcome.result, ScanResult.SPOT_REGISTERED)
        reg = Registration.objects.get(event=self.event, student=self.walkin)
        self.assertEqual(reg.source, Registration.Source.SPOT)
        self.assertTrue(reg.attended)

    def test_branch_5_profile_qr_of_an_already_attended_student_is_a_duplicate(self):
        profile = services.profile_token_for(self.walkin)
        self.scan(profile.token)
        outcome = self.scan(profile.token)
        self.assertEqual(outcome.result, ScanResult.DUPLICATE)

    def test_branch_6_a_pass_for_another_event_is_wrong_event_not_invalid(self):
        """
        The distinction matters at the door: 'wrong event' sends someone to the
        right hall, 'invalid code' sends them to the help desk.
        """
        reg = services.register_student(self.other_event, self.attendee)
        outcome = self.scan(services.live_pass(reg).token)
        self.assertEqual(outcome.result, ScanResult.WRONG_EVENT)
        self.assertIn("Other", outcome.detail)

    def test_branch_7_a_forged_code_is_unrecognised(self):
        outcome = self.scan("v1.not-a-real-token.forged")
        self.assertEqual(outcome.result, ScanResult.UNKNOWN_CODE)

    def test_a_tampered_signature_does_not_verify(self):
        reg = services.register_student(self.event, self.attendee)
        token = services.live_pass(reg).token
        key_id, payload, signature = token.split(".")
        forged = f"{key_id}.{payload}.{'A' * len(signature)}"
        self.assertEqual(self.scan(forged).result, ScanResult.UNKNOWN_CODE)

    def test_an_expired_pass_is_its_own_branch(self):
        reg = services.register_student(self.event, self.attendee)
        event_pass = services.live_pass(reg)
        event_pass.token = qr.issue(qr.PURPOSE_EVENT_PASS, str(event_pass.id),
                                    event_id=str(self.event.id), ttl_seconds=-10)
        event_pass.save()
        self.assertEqual(self.scan(event_pass.token).result, ScanResult.EXPIRED)

    def test_a_replaced_pass_stops_working(self):
        """Reissuing revokes the old one, so a forwarded screenshot is refused."""
        reg = services.register_student(self.event, self.attendee)
        old = services.live_pass(reg).token
        services.reissue_pass(reg)
        outcome = self.scan(old)
        self.assertEqual(outcome.result, ScanResult.UNKNOWN_CODE)
        self.assertIn("newer pass", outcome.detail)

    def test_a_walk_in_is_refused_once_the_event_is_full(self):
        for i in range(3):
            services.register_student(
                self.event, f.student(f"s{i}@college.edu", prn=f"23CS20{i}0"))
        outcome = self.scan(services.profile_token_for(self.walkin).token)
        self.assertEqual(outcome.result, ScanResult.NOT_REGISTERED)

    def test_every_branch_writes_a_scan_record_including_the_failures(self):
        """
        AGENT_PROMPT §5: the failures are the capture-rate metric. Without them a
        station rejecting half its queue looks like a quiet event.
        """
        reg = services.register_student(self.event, self.attendee)
        self.scan(services.live_pass(reg).token)          # accepted
        self.scan(services.live_pass(reg).token if services.live_pass(reg) else "x.y.z")
        self.scan("v1.forged.nope")                        # unknown
        self.scan(services.profile_token_for(self.walkin).token)  # spot
        results = list(ScanRecord.objects.filter(event=self.event)
                       .values_list("result", flat=True))
        self.assertEqual(len(results), 4)
        self.assertIn(ScanResult.UNKNOWN_CODE, results)

        stats = services.capture_stats(self.event)
        self.assertEqual(stats["attempts"], 4)
        self.assertLess(stats["capture_rate"], 1.0,
                        "a rate of 1.0 with a forged scan present would mean "
                        "failures are not being counted")

    def test_a_cancelled_registration_is_told_apart_from_an_unknown_code(self):
        reg = services.register_student(self.event, self.attendee)
        token = services.live_pass(reg).token
        services.cancel_registration(reg)
        outcome = self.scan(token)
        self.assertIn(outcome.result, (ScanResult.CANCELLED, ScanResult.UNKNOWN_CODE))


class OfflineReplayTests(TestCase):
    def setUp(self):
        self.venue = f.venue()
        self.club = f.club("Lens")
        self.organiser = f.student("org@college.edu", prn="23CS1001")
        f.member(self.club, self.organiser, R.CLUB_PRESIDENT)
        self.event = f.event(self.club, self.venue, days=0, status=EventStatus.LIVE)
        self.student = f.student("att@college.edu", prn="23CS1002")
        self.operator = self.organiser.user

    def test_the_earliest_device_timestamp_wins_not_the_arrival_order(self):
        """
        AGENT_PROMPT §5: "Conflict rule: earliest scanned_at wins, later becomes a
        duplicate." Replaying in arrival order would award the check-in to whichever
        packet reached the server first, which is not who reached the door first.
        """
        reg = services.register_student(self.event, self.student)
        profile = services.profile_token_for(self.student).token
        early = timezone.now() - timedelta(minutes=20)
        late = timezone.now() - timedelta(minutes=5)
        # Queue arrives newest-first, as an unsorted replay would deliver it.
        outcomes = services.replay_offline(
            self.event,
            [{"token": profile, "scanned_at": late.isoformat(), "ref": "q2"},
             {"token": profile, "scanned_at": early.isoformat(), "ref": "q1"}],
            operator=self.operator, station_id="GATE-1",
        )
        self.assertEqual(outcomes[0].result, ScanResult.ACCEPTED)
        self.assertEqual(outcomes[1].result, ScanResult.DUPLICATE)
        reg.refresh_from_db()
        self.assertEqual(reg.checked_in_at.replace(microsecond=0),
                         early.replace(microsecond=0),
                         "the recorded time should be when they actually arrived")

    def test_replaying_the_same_queue_twice_does_not_double_record(self):
        """A lost sync response makes a station retry; that must be idempotent."""
        services.register_student(self.event, self.student)
        profile = services.profile_token_for(self.student).token
        batch = [{"token": profile, "scanned_at": timezone.now().isoformat(), "ref": "q1"}]
        services.replay_offline(self.event, batch, operator=self.operator)
        services.replay_offline(self.event, batch, operator=self.operator)
        self.assertEqual(ScanRecord.objects.filter(event=self.event, offline_ref="q1").count(), 1)

    def test_a_replayed_scan_is_flagged_as_offline(self):
        services.register_student(self.event, self.student)
        profile = services.profile_token_for(self.student).token
        services.replay_offline(
            self.event,
            [{"token": profile, "scanned_at": (timezone.now() - timedelta(hours=1)).isoformat(),
              "ref": "q1"}],
            operator=self.operator)
        record = ScanRecord.objects.get(offline_ref="q1")
        self.assertTrue(record.was_offline)


class DoorPermissionTests(TestCase):
    """Who may work a door, proven through the API with real tokens."""

    def setUp(self):
        self.client = APIClient()
        self.venue = f.venue()
        self.club = f.club("Lens")
        self.other_club = f.club("Swara")
        self.president = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        self.plain = f.student("member@college.edu", prn="23CS1002")
        f.member(self.club, self.plain, R.CLUB_MEMBER)
        self.rival = f.student("rival@college.edu", prn="23CS1003")
        f.member(self.other_club, self.rival, R.CLUB_PRESIDENT)
        self.event = f.event(self.club, self.venue, days=0, status=EventStatus.LIVE)
        self.attendee = f.student("att@college.edu", prn="23CS1004")
        self.registration = services.register_student(self.event, self.attendee)

    def post_scan(self, email):
        f.as_user(self.client, email)
        return self.client.post(
            f"/api/v1/participation/events/{self.event.id}/scan",
            {"token": services.live_pass(self.registration).token, "station_id": "GATE-1"},
            format="json")

    def test_the_clubs_president_may_scan(self):
        self.assertEqual(self.post_scan("pres@college.edu").status_code, 200)

    def test_a_plain_club_member_may_not_scan(self):
        """The scan response carries attendee names and PRNs."""
        self.assertEqual(self.post_scan("member@college.edu").status_code, 403)

    def test_another_clubs_president_may_not_scan(self):
        self.assertEqual(self.post_scan("rival@college.edu").status_code, 403)

    def test_an_ordinary_attendee_cannot_scan_themselves_in(self):
        """
        AGENT_PROMPT §2: self-marking does not exist. There is no route for a
        student to mark themselves present, and this is the test of that claim.
        """
        self.assertEqual(self.post_scan("att@college.edu").status_code, 403)
        self.registration.refresh_from_db()
        self.assertFalse(self.registration.attended)

    def test_a_station_token_for_one_event_is_refused_at_another(self):
        """Binding that does not restrict is decoration."""
        other = f.event(self.club, f.venue("Music Room", 40), days=1, title="Other",
                        status=EventStatus.LIVE)
        f.as_user(self.client, "pres@college.edu")
        session = self.client.post(
            f"/api/v1/participation/events/{self.event.id}/scan-session", {}, format="json")
        self.assertEqual(session.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {session.data['access_token']}")
        # Same holder, same club, but the token is bound to self.event.
        blocked = self.client.get(f"/api/v1/participation/events/{other.id}/scan")
        self.assertEqual(blocked.status_code, 403)
        allowed = self.client.get(f"/api/v1/participation/events/{self.event.id}/scan")
        self.assertEqual(allowed.status_code, 200)

    def test_a_pass_token_is_only_returned_to_its_owner(self):
        f.as_user(self.client, "pres@college.edu")
        roster = self.client.get(f"/api/v1/participation/events/{self.event.id}/roster")
        self.assertEqual(roster.status_code, 200)
        body = roster.content.decode()
        self.assertNotIn(services.live_pass(self.registration).token, body,
                         "an organiser must not receive a credential they could present")


class RevokedProfileQrTests(TestCase):
    """
    A reissued profile QR must stop the old one working.

    This was broken: `resolve` filtered StudentQRToken on `student_id` plus
    `revoked_at IS NULL`, which finds whichever record is currently live — so
    presenting a REVOKED code resolved to the live record and was admitted. A lost
    phone's QR kept working for ever after the student reissued it, which is the
    one thing reissuing exists to prevent.
    """

    def setUp(self):
        self.venue = f.venue()
        self.club = f.club("Lens")
        self.organiser = f.student("org@college.edu", prn="23CS1001")
        f.member(self.club, self.organiser, R.CLUB_PRESIDENT)
        self.event = f.event(self.club, self.venue, days=0, status=EventStatus.LIVE)
        self.student = f.student("att@college.edu", prn="23CS1002")
        self.operator = self.organiser.user

    def scan(self, token):
        return services.resolve(token, self.event, operator=self.operator,
                                station_id="GATE-1")

    def test_reissuing_produces_a_different_token(self):
        first = services.profile_token_for(self.student).token
        second = services.reissue_profile_token(self.student).token
        self.assertNotEqual(first, second)

    def test_the_revoked_profile_qr_is_refused(self):
        old = services.profile_token_for(self.student).token
        services.reissue_profile_token(self.student)
        outcome = self.scan(old)
        self.assertEqual(outcome.result, ScanResult.UNKNOWN_CODE)
        self.assertIn("reissued", outcome.detail)
        self.assertFalse(
            Registration.objects.filter(event=self.event, student=self.student,
                                        attended=True).exists(),
            "a revoked code must not admit anyone")

    def test_the_current_profile_qr_still_works(self):
        services.profile_token_for(self.student)
        current = services.reissue_profile_token(self.student).token
        outcome = self.scan(current)
        self.assertEqual(outcome.result, ScanResult.SPOT_REGISTERED)
