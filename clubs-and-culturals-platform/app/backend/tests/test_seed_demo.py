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
