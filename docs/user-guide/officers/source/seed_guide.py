"""Adds the sample data the officers' guide is photographed from, on top of `seed_demo`.

`seed_demo` already holds two events that show what approvers change (Founders' Day
Concert, Laser Light Night). This adds the Music Club's working examples: a proposal
returned by the Cultural Society, one rejected, one moved while it waits, a draft, a
student asking to join, and a student registered for today's live event.

Run it once against a freshly seeded database, with the backend's settings:

    cd clubs-and-culturals-platform/app/backend
    python manage.py migrate && python manage.py seed_demo
    python ../../../docs/user-guide/officers/source/seed_guide.py

It writes state.json (the ids capture.mjs opens) beside this file.
"""
import json
import os
import sys
from datetime import datetime, time, timedelta
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
BACKEND = HERE.parents[3] / "clubs-and-culturals-platform" / "app" / "backend"
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from django.conf import settings  # noqa: E402
from django.core.files.uploadedfile import SimpleUploadedFile  # noqa: E402
from django.db import transaction  # noqa: E402
from django.utils import timezone  # noqa: E402

from budget.models import BudgetLine  # noqa: E402
from budget.services import ensure_budget  # noqa: E402
from clubs.models import Club, JoinRequest  # noqa: E402
from events.models import Event, EventStatus, Venue  # noqa: E402
from events.services import notify_venue_change, reassign_venue, set_proposal_document  # noqa: E402
from governance import services as governance  # noqa: E402
from governance.models import Decision  # noqa: E402
from identity.management.commands.seed_demo import ctx_for  # noqa: E402
from identity.models import Student, User  # noqa: E402

FIXTURE = HERE.parents[3] / "clubs-and-culturals-platform" / "app" / "e2e" / "fixtures" / "proposal.pdf"
TREASURER, PRESIDENT = "24ec1003@college.edu", "25la1001@college.edu"
SOCIETY = "cultural.secretary@college.edu"
JOINER = "22la1052@college.edu"
TITLES = ("Monsoon Unplugged", "Midnight Jam Session", "Acoustic Sundown", "Jazz Appreciation Hour")
# A hosted backend keeps uploads in its own store, which this script cannot write to: with
# GUIDE_NO_FILES=1 the examples are created without a proposal document.
WITH_FILES = os.environ.get("GUIDE_NO_FILES") != "1"


def at(days, hour):
    """`days` from today at `hour`:00 on the campus clock."""
    local = datetime.combine(timezone.localdate() + timedelta(days=days), time(hour))
    return timezone.make_aware(local, ZoneInfo(settings.DISPLAY_TIME_ZONE))


@transaction.atomic
def main():
    if Event.objects.filter(title__in=TITLES).exists():
        raise SystemExit("These examples are already in this database; nothing was added.")
    club = Club.objects.get(name="Music Club")
    venues = {v.name: v for v in Venue.objects.all()}
    treasurer = User.objects.get(email=TREASURER)
    society = ctx_for(User.objects.get(email=SOCIETY))
    out = {"club": str(club.id)}

    def propose(key, title, venue, days, hour, lines, *, description="", doc=True, submit=True):
        event = Event.objects.create(
            title=title, club=club, venue=venues[venue], starts_at=at(days, hour),
            ends_at=at(days, hour + 2), capacity=40, expected_attendance=35,
            description=description, status=EventStatus.DRAFT, kind=Event.Kind.PERFORMANCE,
        )
        budget = ensure_budget(event)
        for position, (head, amount) in enumerate(lines):
            BudgetLine.objects.create(budget=budget, head=head, amount_requested=Decimal(amount),
                                      position=position)
        if doc and WITH_FILES:
            upload = SimpleUploadedFile("proposal.pdf", FIXTURE.read_bytes(), content_type="application/pdf")
            set_proposal_document(event, upload, actor=ctx_for(treasurer))
        approval = governance.submit(event, actor=ctx_for(treasurer), actor_user=treasurer) if submit else None
        out[key] = {"event": str(event.id), "budget": str(budget.id),
                    "approval": str(approval.id) if approval else None}
        return event, approval

    # Returned by the Cultural Society, with the comment the club must act on.
    _, approval = propose("returned", "Monsoon Unplugged", "Music Room", 20, 18,
                          [("Sound & lighting", 12000), ("Refreshments", 3000), ("Printing", 2500)],
                          description="An acoustic evening by first-year members.")
    governance.decide(approval, ctx=society, decision=Decision.RETURN,
                      comment="Please attach the sound vendor’s quote and bring Printing under ₹1,500.")

    # Rejected: final.
    _, approval = propose("rejected", "Midnight Jam Session", "Amphitheatre", 27, 21,
                          [("Sound", 8000)], description="A late-night open jam.")
    governance.decide(approval, ctx=society, decision=Decision.REJECT,
                      comment="Events cannot run past 10 pm on campus. Propose an earlier slot as a new event.")

    # Moved by the Society's Secretary while it is still with the Society.
    event, _ = propose("moved", "Acoustic Sundown", "Music Room", 16, 17,
                       [("Sound", 5000), ("Refreshments", 2000)], description="Sunset set on the lawns.")
    was_venue, was_start = event.venue.name, event.starts_at
    reason = "The Music Room is needed for a department exam that afternoon."
    reassign_venue(event, to_venue=venues["Amphitheatre"], reason=reason, actor=society,
                   starts_at=at(16, 18), ends_at=at(16, 20))
    event.refresh_from_db()
    notify_venue_change(event, from_name=was_venue, reason=reason, from_starts_at=was_start, actor=society)

    # A draft the Treasurer has not priced yet.
    propose("draft", "Jazz Appreciation Hour", "Seminar Hall B", 30, 16, [], doc=False, submit=False)

    # Someone asking to join.
    joiner = Student.objects.get(user__email=JOINER)
    JoinRequest.objects.get_or_create(club=club, student=joiner, state=JoinRequest.State.PENDING)

    if not WITH_FILES:
        print("added:", ", ".join(TITLES))  # a hosted run: capture.mjs never reads these ids
        return
    for title in ("Heritage Photowalk", "Carnatic Music Recital", "Unplugged Evening", "Open Mic Night",
                  "Culturals Night 2026", "Founders’ Day Concert", "Laser Light Night"):
        e = Event.objects.select_related("budget").get(title=title)
        out[title] = {"event": str(e.id), "budget": str(e.budget.id)}
    (HERE / "state.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    print(json.dumps(out, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
