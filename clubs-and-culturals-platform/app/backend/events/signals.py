"""
Club activity (PRD §5.1).

An event being submitted, published, run or closed is the club doing something,
whichever code path moved the status — the events views, the governance
decision that publishes, or the close service. A post-save hook catches all of
them without the governance app having to know about dormancy.
"""
from django.db.models.signals import post_save
from django.dispatch import receiver

from events.models import Event, EventStatus

ACTIVITY_STATUSES = (
    EventStatus.SUBMITTED, EventStatus.APPROVED, EventStatus.PUBLISHED, EventStatus.LIVE,
    EventStatus.COMPLETED, EventStatus.REPORTED,
)


@receiver(post_save, sender=Event, dispatch_uid="events.club_activity")
def record_club_activity(sender, instance, created, update_fields=None, raw=False, **kwargs):
    if raw:
        return
    if update_fields is not None and "status" not in update_fields:
        return
    if instance.status not in ACTIVITY_STATUSES:
        return
    from clubs.services import touch_activity

    touch_activity(instance.club_id, instance.updated_at)
