"""
Adds today's demo accounts and example events to a database that is already in
use, without touching anything in it: `manage.py add_demo_examples`.

`seed_demo` builds a demo from nothing and cannot be re-run over live data. This
adds only what a database seeded before 2026-11-15 lacks:

- the Cultural Society's Vice-Secretary and a plain Society member (the
  Secretary is appointed by migration identity.0003);
- Founders' Day Concert and Laser Light Night, the two events that show what
  approvers change (see seed_demo.add_review_examples).

Safe to run twice: whatever is already there is left alone and reported.
"""
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from clubs.models import Club, Membership
from common import roles as R
from events.models import Event, Venue
from identity.management.commands.seed_demo import PASSWORD, add_review_examples, ctx_for
from identity.models import User

SOCIETY = (
    ("cultural.vicesecretary@college.edu", "Arjun Menon", R.SOCIETY_VICE_SECRETARY),
    ("cultural.member@college.edu", "Sana Fathima", R.CULTURAL_SOCIETY),
)
EXAMPLES = ("Founders’ Day Concert", "Laser Light Night")


class Command(BaseCommand):
    help = "Add the Society's Vice-Secretary and member, and the two approver-change example events."

    @transaction.atomic
    def handle(self, *args, **options):
        for email, name, role in SOCIETY:
            user = User.objects.filter(email=email).first()
            if user is None:
                User.objects.create_user(email=email, password=PASSWORD, full_name=name,
                                         display_name=name, global_roles=[role], mfa_enabled=True)
                self.stdout.write(f"created {email} ({role})")
            else:
                self.stdout.write(f"kept    {email} {user.global_roles}")

        if Event.objects.filter(title__in=EXAMPLES).exists():
            self.stdout.write("kept    the example events (already present)")
            return
        staff = {}
        for key, role in (("society", R.SOCIETY_SECRETARY), ("dean", R.DEAN), ("vc", R.VICE_CHANCELLOR)):
            holders = User.objects.with_global_role(role)
            if not holders:
                raise CommandError(f"Nobody holds the {role} role; the examples need all three approvers.")
            staff[key] = ctx_for(holders[0])
        club = Club.objects.get(name="Music Club")
        president = (Membership.objects.filter(club=club, role=R.CLUB_PRESIDENT, ended_at__isnull=True)
                     .select_related("student__user").first())
        if president is None:
            raise CommandError("The Music Club has no President to propose the example events.")
        today = timezone.localdate()

        def at(days, hour):
            local = datetime.combine(today + timedelta(days=days), time(hour))
            return timezone.make_aware(local, ZoneInfo(settings.DISPLAY_TIME_ZONE))

        concert, lasers = add_review_examples(
            club=club, venues={v.name: v for v in Venue.objects.all()},
            officer=president.student.user, at=at, **staff)
        self.stdout.write(f"created “{concert.title}” ({concert.status}) and “{lasers.title}” ({lasers.status})")
