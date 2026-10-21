"""
QA wave 1 / W2 (commit 5af58d0). Each test here exposes a defect in that
delivery; see docs/qa/wave-1-w2.md for the finding each one proves.
"""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from clubs.models import JoinRequest, OfficeBearerTerm
from common import roles as R
from common.errors import Conflict
from events.models import Event, EventOrganiser, EventStatus
from governance import services as governance
from governance.models import ApprovalState, Decision, Notification
from tests import factories as f


class PublishTransitionIsUnguardedTests(TestCase):
    """
    F1. `decide()` is the only transition into a confirmed status, and it runs
    neither the venue lock nor a clash re-check: the check is in the view, before
    the transaction. Two Deans approving two soft-clashing proposals at once both
    pass the view check; the second commit is a double booking on SQLite and an
    unmapped IntegrityError (500) on PostgreSQL.
    """

    def setUp(self):
        f.semester()
        self.hall = f.venue("Seminar Hall A", 150)
        self.swara = f.club("Swara")
        self.natya = f.club("Natya")
        pres = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.swara, pres, R.CLUB_PRESIDENT)
        self.pres_ctx = f.ctx_for(pres.user)
        approver = f.user("gate@college.edu", global_roles=[R.CULTURAL_SOCIETY, R.DEAN], mfa=True)
        self.gate = f.ctx_for(approver)

    def _submitted(self, club, hour):
        event = f.event(club, self.hall, days=7, hour=hour, status=EventStatus.DRAFT)
        f.budget(event, amounts=(5000,))
        return event, governance.submit(event, actor=self.pres_ctx)

    def _approve_through(self, request):
        for _ in range(4):
            request.refresh_from_db()
            if request.state != ApprovalState.PENDING:
                break
            governance.decide(request, ctx=self.gate, decision=Decision.APPROVE)
        request.refresh_from_db()
        return request

    def test_the_service_refuses_to_publish_into_a_confirmed_booking(self):
        first, req_a = self._submitted(self.swara, 16)
        second, req_b = self._submitted(self.natya, 17)      # soft clash at submission
        self._approve_through(req_a)
        self.assertEqual(Event.objects.get(pk=first.pk).status, EventStatus.PUBLISHED)
        # The view would have caught this; the service, which is the transaction,
        # does not — so anything that reaches decide() after the view's check
        # (a concurrent approval, a job, a second code path) double-books.
        with self.assertRaises(Conflict, msg="publishing into a confirmed booking must be refused"):
            self._approve_through(req_b)
        self.assertEqual(Event.objects.filter(venue=self.hall, status=EventStatus.PUBLISHED).count(), 1)


class BackdatedHandoverTests(TestCase):
    """
    F2. `handover()` closes only terms with `starts_at < effective_at`. A term
    opened after the chosen effective date survives, so a backdated handover
    leaves two current Presidents: both tokens carry the scope, and
    `apply_due_terms` trips `one_active_president_per_club` (500).
    """

    def setUp(self):
        self.client = APIClient()
        self.club = f.club("Swara")
        self.pres = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.pres, R.CLUB_PRESIDENT)
        self.vp = f.student("vp@college.edu", prn="23CS1002")
        f.member(self.club, self.vp, R.CLUB_VICE_PRESIDENT)
        self.member = f.student("m@college.edu", prn="23CS1003")
        f.member(self.club, self.member, R.CLUB_MEMBER)
        self.now = timezone.now()

    def handover(self, email, effective_at, student):
        f.as_user(self.client, email)
        return self.client.post(f"/api/v1/clubs/{self.club.id}/handover", {
            "effective_at": effective_at.isoformat(),
            "assignments": [{"student_id": str(student.id), "role": R.CLUB_PRESIDENT}],
        }, format="json")

    def test_a_handover_backdated_before_the_current_term_does_not_leave_two_presidents(self):
        first = self.handover("pres@college.edu", self.now - timedelta(minutes=1), self.vp)
        self.assertEqual(first.status_code, 201, first.data)
        self.client.raise_request_exception = False
        second = self.handover("vp@college.edu", self.now - timedelta(days=2), self.member)
        self.assertIn(second.status_code, (201, 422), getattr(second, "data", second.content))
        presidents = [
            t for t in OfficeBearerTerm.objects.filter(club=self.club, role=R.CLUB_PRESIDENT)
            if t.is_current(timezone.now())
        ]
        self.assertEqual(len(presidents), 1, "exactly one current President")


class JoinQueueNotificationFollowsTheTermTests(TestCase):
    """
    F3. `_notify_assigners` (and governance `_notify_club`) select recipients by
    `Membership.role`. After a future-dated handover takes effect, the terms say
    one thing and the rows another until the next handover runs
    `apply_due_terms`, so the queue notification goes to the outgoing President.
    """

    def setUp(self):
        self.client = APIClient()
        self.club = f.club("Swara")
        self.old = f.student("old@college.edu", prn="23CS1001")
        f.member(self.club, self.old, R.CLUB_PRESIDENT)
        self.new = f.student("new-pres@college.edu", prn="23CS1002")
        f.member(self.club, self.new, R.CLUB_MEMBER)
        self.applicant = f.student("app@college.edu", prn="23CS1003")
        now = timezone.now()
        # The state a future-dated handover leaves once its date has passed.
        OfficeBearerTerm.objects.create(club=self.club, student=self.old, role=R.CLUB_PRESIDENT,
                                        starts_at=now - timedelta(days=400),
                                        ends_at=now - timedelta(days=1))
        OfficeBearerTerm.objects.create(club=self.club, student=self.new, role=R.CLUB_PRESIDENT,
                                        starts_at=now - timedelta(days=1))

    def test_the_current_president_hears_of_the_request_not_the_outgoing_one(self):
        f.as_user(self.client, "app@college.edu")
        response = self.client.post(f"/api/v1/clubs/{self.club.id}/join", {}, format="json")
        self.assertEqual(response.status_code, 202, response.data)
        recipients = set(Notification.objects.filter(kind="club.join_requested")
                         .values_list("user__email", flat=True))
        self.assertEqual(recipients, {"new-pres@college.edu"})


class AcceptWhenAlreadyAMemberTests(TestCase):
    """
    F4. Accepting a request for a student who became a member by another route
    (join_mode flipped to open, a direct add) returns 409 and leaves the request
    pending forever: it can never be accepted and shows in the queue count.
    """

    def setUp(self):
        self.client = APIClient()
        self.club = f.club("Swara")
        self.pres = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.pres, R.CLUB_PRESIDENT)
        self.applicant = f.student("app@college.edu", prn="23CS1002")

    def test_the_request_is_settled_not_left_pending(self):
        f.as_user(self.client, "app@college.edu")
        self.client.post(f"/api/v1/clubs/{self.club.id}/join", {}, format="json")
        request = JoinRequest.objects.get(student=self.applicant)
        f.member(self.club, self.applicant)                  # joined by another route
        f.as_user(self.client, "pres@college.edu")
        response = self.client.post(
            f"/api/v1/clubs/{self.club.id}/join-requests/{request.id}/accept", {}, format="json")
        self.assertIn(response.status_code, (200, 409))
        request.refresh_from_db()
        self.assertNotEqual(request.state, JoinRequest.State.PENDING,
                            "a request for an existing member must not stay pending")


class MalformedPathIdTests(TestCase):
    """
    F5. The nested-path ids (`request_id`, `student_id`) go straight into a
    UUIDField filter; a non-UUID raises Django's ValidationError, which the
    problem-detail handler does not map, so the client gets a 500 for a typo.
    """

    def setUp(self):
        self.client = APIClient()
        self.client.raise_request_exception = False
        f.semester()
        self.club = f.club("Swara")
        self.pres = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.pres, R.CLUB_PRESIDENT)
        self.event = f.event(self.club, f.venue(), days=7, status=EventStatus.PUBLISHED)
        f.as_user(self.client, "pres@college.edu")

    def test_a_malformed_organiser_id_is_404_not_500(self):
        response = self.client.delete(f"/api/v1/events/{self.event.id}/organisers/not-a-uuid")
        self.assertEqual(response.status_code, 404)

    def test_a_malformed_join_request_id_is_404_not_500(self):
        response = self.client.post(
            f"/api/v1/clubs/{self.club.id}/join-requests/not-a-uuid/accept", {}, format="json")
        self.assertEqual(response.status_code, 404)


class OrganiserGrantIsTimeBoundTests(TestCase):
    """
    F6. MASTER_SPEC §3.3: organiser access is "time-bound to the event plus a
    limited window". A grant made without `ends_at` is open-ended and carries
    the attendee-list scope indefinitely.
    """

    def setUp(self):
        self.client = APIClient()
        f.semester()
        self.club = f.club("Swara")
        self.pres = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.pres, R.CLUB_PRESIDENT)
        self.organiser = f.student("org@college.edu", prn="23CS1002")
        self.event = f.event(self.club, f.venue(), days=7, status=EventStatus.PUBLISHED)

    def test_a_grant_without_an_end_defaults_to_the_event_window(self):
        f.as_user(self.client, "pres@college.edu")
        response = self.client.post(f"/api/v1/events/{self.event.id}/organisers",
                                    {"student_id": str(self.organiser.id)}, format="json")
        self.assertEqual(response.status_code, 201, response.data)
        grant = EventOrganiser.objects.get(event=self.event, student=self.organiser)
        self.assertIsNotNone(grant.ends_at, "an organiser grant must expire with the event")
        self.assertLessEqual(grant.ends_at, self.event.ends_at + timedelta(days=7))
