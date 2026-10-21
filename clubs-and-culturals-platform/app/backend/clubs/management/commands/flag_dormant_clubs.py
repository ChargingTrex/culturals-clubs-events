"""
Flag clubs with no activity for DORMANCY_DAYS as dormant (PRD §5.1).

Run from cron or the jobs endpoint. Idempotent: a club already dormant is not
touched, and a dormant club becomes active again the moment it does something
(clubs/services.touch_activity).
"""
from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from clubs.services import flag_dormant


class Command(BaseCommand):
    help = "Flag clubs with no activity for DORMANCY_DAYS as dormant."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=None,
                            help=f"Override DORMANCY_DAYS (currently {settings.DORMANCY_DAYS}).")

    def handle(self, *args, **options):
        flagged = flag_dormant(timezone.now(), days=options["days"])
        for club in flagged:
            self.stdout.write(f"dormant: {club.name}")
        self.stdout.write(self.style.SUCCESS(f"{len(flagged)} club(s) flagged dormant."))
