"""The demo seed runs end to end: it is the only caller of several services, so a
signature change there (e.g. close_event) is caught here, not on a hosted database."""
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from events.models import Event, EventStatus


class SeedDemoTests(TestCase):
    def test_the_seed_runs_and_reports_the_past_events(self):
        call_command("seed_demo", stdout=StringIO())
        reported = Event.objects.filter(status=EventStatus.REPORTED)
        self.assertGreaterEqual(reported.count(), 1)
        self.assertTrue(all(e.photos.exists() for e in reported))

    def test_the_seed_holds_two_events_showing_what_approvers_change(self):
        from governance.models import Notification

        call_command("seed_demo", stdout=StringIO())
        concert = Event.objects.get(title="Founders’ Day Concert")
        self.assertEqual(concert.status, EventStatus.PUBLISHED)
        move = concert.reassignments.get()
        self.assertEqual((move.from_venue.name, move.to_venue.name, move.actor_role),
                         ("Main Auditorium", "Open Air Theatre", "cultural_society_secretary"))
        steps = list(concert.approval_requests.get().steps.order_by("created_at")
                     .values_list("stage", "decision", "actor_role"))
        self.assertEqual(steps, [("cultural_society", "approve", "cultural_society_secretary"),
                                 ("dean", "approve", "dean"), ("vc", "approve", "vice_chancellor")])
        self.assertLess(concert.budget.total_sanctioned, concert.budget.total_requested)

        lasers = Event.objects.get(title="Laser Light Night")
        self.assertEqual(lasers.status, EventStatus.REJECTED)
        last = lasers.approval_requests.get().steps.order_by("created_at").last()
        self.assertEqual((last.stage, last.decision), ("vc", "reject"))

        kinds = set(Notification.objects.filter(subject__contains="Founders’ Day Concert")
                    .values_list("kind", flat=True))
        self.assertLessEqual({"event.venue_changed", "approval.sanction_changed",
                              "approval.advanced", "approval.approved"}, kinds)

    def test_add_demo_examples_fills_in_an_older_database_and_is_safe_to_repeat(self):
        from identity.models import User

        call_command("seed_demo", stdout=StringIO())
        # An older demo database: no Vice-Secretary, no Society member, no example events.
        Event.objects.filter(title__in=["Founders’ Day Concert", "Laser Light Night"]).delete()
        User.objects.filter(email__in=["cultural.vicesecretary@college.edu",
                                       "cultural.member@college.edu"]).delete()
        before = Event.objects.count()

        out = StringIO()
        call_command("add_demo_examples", stdout=out)
        self.assertIn("created cultural.vicesecretary@college.edu", out.getvalue())
        vice = User.objects.get(email="cultural.vicesecretary@college.edu")
        self.assertEqual(vice.global_roles, ["cultural_society_vice_secretary"])
        self.assertTrue(vice.check_password("culturals-demo"))
        self.assertEqual(Event.objects.count(), before + 2)
        self.assertEqual(Event.objects.get(title="Laser Light Night").status, EventStatus.REJECTED)

        again = StringIO()
        call_command("add_demo_examples", stdout=again)
        self.assertIn("kept", again.getvalue())
        self.assertNotIn("created", again.getvalue())
        self.assertEqual(Event.objects.count(), before + 2)
