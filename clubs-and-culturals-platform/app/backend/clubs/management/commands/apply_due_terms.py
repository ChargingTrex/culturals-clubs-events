"""
Bring every club's Membership rows in line with its office-bearer terms.

The token reads the terms directly, so a dated handover is already in force
the moment its date passes; this makes the roster rows (and the one-president
constraint they carry) catch up. Run daily from cron or the jobs endpoint.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone

from clubs.models import Club
from clubs.services import apply_due_terms


class Command(BaseCommand):
    help = "Apply office-bearer terms that have come due to the Membership rows."

    def handle(self, *args, **options):
        now = timezone.now()
        total = 0
        for club in Club.objects.exclude(status=Club.Status.ARCHIVED):
            changed = apply_due_terms(club, now)
            total += len(changed)
            for membership in changed:
                self.stdout.write(f"{club.name}: {membership.student.prn} -> {membership.role}")
        self.stdout.write(self.style.SUCCESS(f"{total} membership row(s) updated."))
