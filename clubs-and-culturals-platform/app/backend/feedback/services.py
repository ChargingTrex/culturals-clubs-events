"""
Submitting feedback and summarising it.

Error codes follow the house pattern (common/errors.py): declared where they
are raised, prefixed with the app name, with `code` being what clients branch on.
"""
from django.db import IntegrityError, transaction
from django.db.models import Avg, Count, Q

from common.errors import Conflict, ProblemDetail
from events.models import REPORTABLE
from feedback.models import Feedback
from participation.models import Registration


@transaction.atomic
def submit_feedback(event, student, *, rating, would_recommend, comment=""):
    """
    Only an attendee of a closed event may submit, and only once.

    Attendance means `Registration.attended` (rule 6): a registered-but-absent
    student did not experience the event and has nothing to rate.
    """
    if event.status not in REPORTABLE:
        raise Conflict(code="FEEDBACK_NOT_OPEN", title="Feedback is not open",
                       detail="Feedback opens once the event has been closed.")
    registration = Registration.objects.filter(
        event=event, student=student, cancelled_at__isnull=True, attended=True
    ).first()
    if registration is None:
        raise ProblemDetail(code="FEEDBACK_NOT_ATTENDED", title="Not an attendee",
                            status_code=403,
                            detail="Only someone checked in at this event can leave feedback.")
    try:
        with transaction.atomic():
            return Feedback.objects.create(
                event=event, registration=registration, student=student, rating=rating,
                would_recommend=would_recommend, comment=comment or "",
            )
    except IntegrityError as exc:
        # The unique constraint fired: one submission per student per event.
        raise Conflict(code="FEEDBACK_ALREADY_SUBMITTED", title="Already submitted",
                       detail="You have already left feedback for this event.") from exc


def summarise(event):
    """
    Aggregates and anonymous comments. No ids, no names, no PRNs: the organiser
    learns how the event landed, not who said what.
    """
    rows = Feedback.objects.filter(event=event)
    agg = rows.aggregate(
        count=Count("id"),
        average_rating=Avg("rating"),
        recommend=Count("id", filter=Q(would_recommend=True)),
    )
    count = agg["count"] or 0
    return {
        "count": count,
        "average_rating": round(agg["average_rating"], 2) if count else None,
        "recommend_rate": round(agg["recommend"] / count, 3) if count else None,
        "comments": list(rows.exclude(comment="").order_by("created_at")
                         .values_list("comment", flat=True)),
    }
