"""
Venue clash detection and atomic reassignment.
"""
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from common.errors import Conflict
from events.models import SLOT_CONFIRMED, SLOT_HOLDING, Event, EventStatus, VenueReassignment

# An event can change venue while it still holds its booking: pending, approved,
# published, or live (a mid-event evacuation). A completed or reported event's
# venue is a record of where it happened.
MOVABLE = (EventStatus.SUBMITTED, EventStatus.APPROVED, EventStatus.PUBLISHED, EventStatus.LIVE)


def _buffer():
    """Setup and clear-down time counted as part of the booking."""
    return timedelta(minutes=settings.VENUE_BUFFER_MINUTES)


def overlapping(event=None, *, venue_id, starts_at, ends_at, statuses=SLOT_HOLDING, exclude_id=None):
    """
    Events in the same venue whose windows touch, buffer included.

    Two bookings overlap when each starts before the other ends. The buffer is
    subtracted from both starts, so a set-up crew arriving 20 minutes after the
    previous show ends still registers as a clash.
    """
    buffer = _buffer()
    qs = Event.objects.filter(
        venue_id=venue_id,
        status__in=statuses,
        starts_at__lt=ends_at + buffer,
        ends_at__gt=starts_at - buffer,
    ).select_related("club", "venue")
    if exclude_id or event is not None:
        qs = qs.exclude(pk=exclude_id or event.pk)
    return qs


def hard_clashes(**kwargs):
    """Overlaps with a *confirmed* booking. These block; they are not advisory."""
    return overlapping(statuses=SLOT_CONFIRMED, **kwargs)


def soft_clashes(**kwargs):
    """
    Overlaps with another pending request.

    Allowed through deliberately: two clubs may both want Friday evening, and
    which one gets it is the Dean's call, not a validation error. The request is
    accepted and flagged (Event_Flows: "resolve under Venues before approving").
    """
    return overlapping(statuses=(EventStatus.SUBMITTED,), **kwargs)


def clashes_for(event):
    return list(overlapping(event, venue_id=event.venue_id, starts_at=event.starts_at,
                            ends_at=event.ends_at))


def all_clashes():
    """Every clashing pair across the calendar, each pair reported once."""
    seen, out = set(), []
    for event in Event.objects.filter(status__in=SLOT_HOLDING).select_related("club", "venue"):
        for other in clashes_for(event):
            key = tuple(sorted([str(event.pk), str(other.pk)]))
            if key not in seen:
                seen.add(key)
                out.append((event, other))
    return out


def assert_bookable(*, venue_id, starts_at, ends_at, exclude_id=None):
    """Raise on a confirmed clash. Returns the soft clashes for the caller to flag."""
    hard = list(hard_clashes(venue_id=venue_id, starts_at=starts_at, ends_at=ends_at,
                             exclude_id=exclude_id))
    if hard:
        other = hard[0]
        local = ZoneInfo(settings.DISPLAY_TIME_ZONE)
        buffer = (f", including a {settings.VENUE_BUFFER_MINUTES}-minute buffer"
                  if settings.VENUE_BUFFER_MINUTES else "")
        raise Conflict(
            code="EVENTS_VENUE_UNAVAILABLE",
            title="Venue already booked",
            detail=(f"{other.venue.name} is booked for “{other.title}” from "
                    f"{other.starts_at.astimezone(local):%H:%M} to "
                    f"{other.ends_at.astimezone(local):%H:%M} that day{buffer}."),
            errors=[{"field": "venue", "code": "UNAVAILABLE", "message": other.title}],
        )
    return list(soft_clashes(venue_id=venue_id, starts_at=starts_at, ends_at=ends_at,
                             exclude_id=exclude_id))


@transaction.atomic
def reassign_venue(event, *, to_venue, reason, actor):
    """
    Move an event to another venue in one transaction.

    AGENT_PROMPT §5 requires this to be atomic. `select_for_update` on the event
    plus the clash re-check inside the same transaction is what closes the window:
    without the lock, two Deans resolving the same clash concurrently can both
    read the target venue as free and both move an event into it.
    """
    from events.models import Venue

    locked = Event.objects.select_for_update().get(pk=event.pk)
    if locked.status not in MOVABLE:
        raise Conflict(
            code="EVENTS_NOT_MOVABLE", title="This event cannot be moved",
            detail=(f"“{locked.title}” is {locked.get_status_display().lower()}; only an "
                    "event that still holds its booking can move to another venue."),
        )
    # Lock the target venue too (event first, then venue — the same order every
    # booking path uses): two Deans moving two events into one free hall must
    # queue on the venue row, or both read it as free. The event row lock alone
    # does not serialise them, since each locks a different event.
    Venue.objects.select_for_update().get(pk=to_venue.pk)
    if to_venue.pk == locked.venue_id:
        raise Conflict(code="EVENTS_SAME_VENUE", title="Already in that venue",
                       detail="Choose a different venue.")
    if not to_venue.active:
        raise Conflict(code="EVENTS_VENUE_CLOSED", title="Venue closed",
                       detail=f"{to_venue.name} is closed for bookings. Choose an open venue.")
    if to_venue.capacity < locked.expected_attendance:
        raise Conflict(
            code="EVENTS_VENUE_TOO_SMALL", title="Venue too small",
            detail=(f"{to_venue.name} seats {to_venue.capacity}; "
                    f"{locked.expected_attendance} are expected."),
        )
    # A confirmed booking raises inside assert_bookable. A *pending* request in
    # the target slot is refused here too: the move exists to resolve a clash,
    # and landing on another club's request would create a new one that blocks
    # both approvals.
    contested = assert_bookable(venue_id=to_venue.pk, starts_at=locked.starts_at,
                                ends_at=locked.ends_at, exclude_id=locked.pk)
    if contested:
        other = contested[0]
        raise Conflict(
            code="EVENTS_VENUE_CONTESTED", title="Another request wants that slot",
            detail=(f"{to_venue.name} is requested for “{other.title}” ({other.club.name}) "
                    f"from {other.starts_at:%H:%M} to {other.ends_at:%H:%M}. Moving here "
                    "would create a new clash; decide that request first or choose "
                    "another venue."),
            errors=[{"field": "to_venue", "code": "CONTESTED", "message": other.title}],
        )
    from_venue_id = locked.venue_id
    locked.venue = to_venue
    locked.save(update_fields=["venue", "updated_at"])
    VenueReassignment.objects.create(
        event=locked, from_venue_id=from_venue_id, to_venue=to_venue, reason=reason,
        actor_sub=actor.sub, actor_label=actor.display_name,
    )
    return locked


def notify_venue_change(event, *, from_name, reason):
    """
    Tell everyone who would otherwise go to the wrong hall.

    A venue change carries no money, so unlike approval outcomes it is not
    limited to the budget roles: the club's office bearers (the Secretary runs
    the event), the event's organisers, and every student still registered or
    waitlisted. Each person is told once.
    """
    from clubs.models import Membership
    from common import roles as R
    from events.models import EventOrganiser
    from integrations.registry import notifier
    from participation.models import Registration

    subject = f"“{event.title}” was moved to {event.venue.name}"
    body = (f"{event.starts_at:%a %d %b, %H:%M}. Moved from {from_name} to "
            f"{event.venue.name}. Reason: {reason}")
    club_link = f"/club/events/{event.id}"
    student_link = f"/events/{event.id}"

    recipients = {}
    office = (R.CLUB_PRESIDENT, R.CLUB_VICE_PRESIDENT, R.CLUB_SECRETARY, R.CLUB_TREASURER)
    for m in Membership.objects.filter(club=event.club, ended_at__isnull=True,
                                       role__in=office).select_related("student__user"):
        recipients.setdefault(m.student.user_id, (m.student.user, club_link))
    for grant in EventOrganiser.active().filter(event=event).select_related("student__user"):
        recipients.setdefault(grant.student.user_id, (grant.student.user, club_link))
    for reg in Registration.objects.filter(event=event, cancelled_at__isnull=True,
                                           student__isnull=False).select_related("student__user"):
        recipients.setdefault(reg.student.user_id, (reg.student.user, student_link))

    for user, link in recipients.values():
        notifier().send(recipient=user, subject=subject, body=body,
                        kind="event.venue_changed", link=link)
    return len(recipients)


def free_venues_for(event):
    """Venues that are free at the event's time and large enough for it."""
    from events.models import Venue

    out = []
    for venue in Venue.objects.filter(active=True).exclude(pk=event.venue_id):
        if venue.capacity < event.expected_attendance:
            continue
        if overlapping(event, venue_id=venue.pk, starts_at=event.starts_at,
                       ends_at=event.ends_at).exists():
            continue
        out.append(venue)
    return out


def close_event(event, *, photo_count, social_links, actor):
    """
    Close and report an event.

    At least one photo is required: Event_Flows treats evidence as part of
    closing, and the semester report's "missing evidence" list exists to chase
    exactly this. Attendance is not re-derived here — it is whatever the door
    recorded.
    """
    if photo_count < 1:
        raise Conflict(code="EVENTS_EVIDENCE_REQUIRED", title="Evidence required",
                       detail="An event cannot be closed without at least one photo.",
                       errors=[{"field": "photo_count", "code": "REQUIRED",
                                "message": "Upload at least one photo."}])
    if event.status not in (EventStatus.LIVE, EventStatus.PUBLISHED, EventStatus.COMPLETED):
        raise Conflict(code="EVENTS_NOT_CLOSEABLE", title="Cannot close this event",
                       detail=f"An event that is {event.get_status_display().lower()} cannot be closed.")
    event.photo_count = photo_count
    event.social_links = [link for link in social_links if link]
    event.status = EventStatus.REPORTED
    event.closed_at = timezone.now()
    event.save(update_fields=["photo_count", "social_links", "status", "closed_at", "updated_at"])
    return event
