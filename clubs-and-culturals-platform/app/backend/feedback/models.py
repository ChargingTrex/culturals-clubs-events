"""
Post-event feedback (PRD 5.8).

One row per attendee per event, and only an attendee can leave one: feedback
from someone who was not there is noise in the organiser's numbers. Both rules
are database constraints, not application checks (AGENT_PROMPT §3, rule 3).

Organisers never see individual rows. The summary endpoint is the only read,
and it returns aggregates and anonymous comments.
"""
from django.db import models

from common.models import UUIDModel


class Feedback(UUIDModel):
    event = models.ForeignKey("events.Event", on_delete=models.PROTECT,
                              related_name="feedback")
    registration = models.ForeignKey("participation.Registration", on_delete=models.PROTECT,
                                     related_name="feedback")
    student = models.ForeignKey("identity.Student", on_delete=models.PROTECT,
                                related_name="feedback")
    rating = models.PositiveSmallIntegerField()
    would_recommend = models.BooleanField()
    comment = models.TextField(blank=True)

    class Meta:
        ordering = ("created_at",)
        constraints = [
            models.CheckConstraint(
                condition=models.Q(rating__gte=1, rating__lte=5),
                name="feedback_rating_1_to_5",
            ),
            models.UniqueConstraint(
                fields=["event", "student"],
                name="one_feedback_per_student_per_event",
            ),
        ]

    def __str__(self):
        return f"{self.rating}/5 for {self.event_id}"
