"""
Venue clash detection and atomic reassignment.
"""
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from common.errors import Conflict
from events.models import SLOT_CONFIRMED, SLOT_HOLDING, Event, EventStatus, VenueReassignment


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
        raise Conflict(
            code="EVENTS_VENUE_UNAVAILABLE",
            title="Venue already booked",
            detail=(f"{other.venue.name} is booked for “{other.title}” from "
                    f"{other.starts_at:%H:%M} to {other.ends_at:%H:%M} that day, "
                    f"including a {settings.VENUE_BUFFER_MINUTES}-minute buffer."),
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
    locked = Event.objects.select_for_update().get(pk=event.pk)
    if to_venue.pk == locked.venue_id:
        raise Conflict(code="EVENTS_SAME_VENUE", title="Already in that venue",
                       detail="Choose a different venue.")
    if to_venue.capacity < locked.expected_attendance:
        raise Conflict(
            code="EVENTS_VENUE_TOO_SMALL", title="Venue too small",
            detail=(f"{to_venue.name} seats {to_venue.capacity}; "
                    f"{locked.expected_attendance} are expected."),
        )
    assert_bookable(venue_id=to_venue.pk, starts_at=locked.starts_at,
                    ends_at=locked.ends_at, exclude_id=locked.pk)
    from_venue_id = locked.venue_id
    locked.venue = to_venue
    locked.save(update_fields=["venue", "updated_at"])
    VenueReassignment.objects.create(
        event=locked, from_venue_id=from_venue_id, to_venue=to_venue, reason=reason,
        actor_sub=actor.sub, actor_label=actor.display_name,
    )
    return locked


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
