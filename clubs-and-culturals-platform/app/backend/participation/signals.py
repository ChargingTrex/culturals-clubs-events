"""
Event changes that registered students must hear about (PRD 5.5, 5.16.3).

Publication happens in governance/services.py:decide and venue moves in
events/services.py:reassign_venue; both go through `Event.save()`. Observing
that here keeps the dependency pointing the right way — participation knows
about events, events and governance know nothing about participation — and
means neither of those modules has to be edited to add a recipient.

Both hooks run inside the caller's transaction, like every other notification
in this codebase, and through the NotificationSender seam only.
"""
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from events.models import Event, EventStatus

_BEFORE = "_participation_before"
_WATCHED = {"status", "venue", "venue_id"}


@receiver(pre_save, sender=Event)
def remember_status_and_venue(sender, instance, raw=False, update_fields=None, **kwargs):
    if raw or instance._state.adding:
        return
    if update_fields is not None and not (_WATCHED & set(update_fields)):
        return
    before = (Event.objects.filter(pk=instance.pk)
              .values_list("status", "venue_id").first())
    if before is not None:
        setattr(instance, _BEFORE, before)


@receiver(post_save, sender=Event)
def tell_registered_students(sender, instance, created=False, raw=False, **kwargs):
    before = getattr(instance, _BEFORE, None)
    if created or raw or before is None:
        return
    delattr(instance, _BEFORE)
    from participation.services import notify_registered_students

    old_status, old_venue_id = before
    # Each fan-out is deferred to commit (notify_registered_students itself
    # queues through transaction.on_commit): a publication or a move that rolls
    # back after this hook must not have told anyone, and the sends must not run
    # while the caller still holds the event row lock.
    if old_status != EventStatus.PUBLISHED and instance.status == EventStatus.PUBLISHED:
        notify_registered_students(
            instance,
            subject=f"“{instance.title}” is published",
            body=(f"“{instance.title}” on {instance.starts_at:%d %b %Y} at "
                  f"{instance.venue.name} is confirmed and on the calendar."),
            kind="event.published",
        )
    if old_venue_id != instance.venue_id:
        notify_registered_students(
            instance,
            subject=f"Venue change: “{instance.title}”",
            body=(f"“{instance.title}” on {instance.starts_at:%d %b %Y} has moved to "
                  f"{instance.venue.name}. Your pass is unchanged."),
            kind="event.venue_changed",
        )
