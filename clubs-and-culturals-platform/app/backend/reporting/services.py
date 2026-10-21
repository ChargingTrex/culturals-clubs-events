"""
Semester report aggregation.

AGENT_PROMPT §5 gives these definitions exactly. `unique_students` is the
headline figure: 20 events attended by the same 80 students and 20 events
reaching 600 both give total_participation = 1600, and only the DISTINCT count
separates them. tests/test_reporting.py checks it against a dataset with known,
deliberate overlap rather than assuming the query is right because it runs.
"""
from decimal import Decimal

from django.db.models import Count, Q, Sum

from events.models import REPORTABLE, SLOT_HOLDING, Event
from participation.models import ACCEPTING, Registration, ScanRecord


def _reportable_events(semester):
    return Event.objects.filter(
        status__in=REPORTABLE,
        starts_at__date__gte=semester.starts_on,
        starts_at__date__lte=semester.ends_on,
    ).select_related("club", "venue")


def _attended(events):
    return Registration.objects.filter(
        event__in=events, attended=True, cancelled_at__isnull=True
    )


def semester_report(semester):
    events = _reportable_events(semester)
    attended = _attended(events)

    events_run = events.count()
    total_participation = attended.count()
    # Own students and external participants are counted separately and never
    # summed (rule 7) — summing them would report outsiders as reach.
    unique_students = (attended.filter(student__isnull=False)
                       .values("student_id").distinct().count())
    external_unique = (attended.filter(external__isnull=False)
                       .values("external_id").distinct().count())

    by_club = list(
        events.values("club__id", "club__name", "club__tag", "club__category")
        .annotate(
            events_run=Count("id", distinct=True),
            attendance=Count("registrations",
                             filter=Q(registrations__attended=True,
                                      registrations__cancelled_at__isnull=True)),
        )
        .order_by("-attendance")
    )

    # Grouped by the department recorded at the event, not the student's current
    # one, so a re-issued report of a past semester gives the same numbers.
    by_department = list(
        attended.filter(student__isnull=False)
        .values("department_at_event")
        .annotate(students_reached=Count("student_id", distinct=True),
                  attendance=Count("id"))
        .order_by("-students_reached")
    )

    money = events.aggregate(
        requested=Sum("budget__lines__amount_requested"),
        sanctioned=Sum("budget__lines__amount_sanctioned"),
        spent=Sum("budget__lines__amount_spent"),
    )

    return {
        "semester": {"id": str(semester.id), "name": semester.name,
                     "starts_on": semester.starts_on, "ends_on": semester.ends_on},
        "events_run": events_run,
        "total_participation": total_participation,
        "unique_students": unique_students,
        "external_participants": external_unique,
        "avg_attendance": round(total_participation / events_run) if events_run else 0,
        "by_club": [
            {"club_id": str(row["club__id"]), "club": row["club__name"],
             "tag": row["club__tag"], "category": row["club__category"],
             "events_run": row["events_run"], "attendance": row["attendance"]}
            for row in by_club
        ],
        "by_department": [
            {"department": row["department_at_event"] or "unknown",
             "students_reached": row["students_reached"], "attendance": row["attendance"]}
            for row in by_department
        ],
        "money": {k: str(v or Decimal("0")) for k, v in money.items()},
        "events": [
            {"id": str(e.id), "title": e.title, "club": e.club.name,
             "starts_at": e.starts_at, "attended": e.attended_count(),
             "registered": e.registered_count(), "photos": e.photo_count,
             "social_links": e.social_links,
             "sanctioned": str(getattr(getattr(e, "budget", None), "total_sanctioned", 0) or 0),
             "spent": str(getattr(getattr(e, "budget", None), "total_spent", 0) or 0)}
            for e in events.order_by("starts_at")
        ],
        # Legacy rule from the platform prompt §5: historical activity is not
        # reconstructed, so the first period on the platform is caveated rather
        # than presented as a complete picture.
        "caveats": [
            "Figures are counted at the door from attendance records, not estimated.",
            "Own students and external participants are counted separately and never summed.",
            "Activity that ran outside the system is not included, so totals understate the real figure.",
        ],
    }


def dean_overview(semester):
    """
    The Dean's running view: what needs chasing, rather than what happened.
    """
    from events.models import EventStatus
    from events.services import all_clashes
    from governance.models import ApprovalRequest, ApprovalState
    from clubs.models import Club

    in_semester = Event.objects.filter(
        starts_at__date__gte=semester.starts_on, starts_at__date__lte=semester.ends_on
    )
    done = in_semester.filter(status__in=REPORTABLE)
    # Evidence chasing: a closed event with no photos or no post link is the gap
    # that makes a semester report thinner than the semester actually was.
    missing_evidence = [
        {"id": str(e.id), "title": e.title, "club": e.club.name,
         "missing": [m for m in (("photos" if not e.photo_count else None),
                                 ("social post link" if not e.social_links else None)) if m]}
        for e in done.select_related("club") if not e.photo_count or not e.social_links
    ]
    active_club_ids = set(done.values_list("club_id", flat=True))
    clubs = list(Club.objects.filter(status=Club.Status.ACTIVE))

    pending = ApprovalRequest.objects.filter(state=ApprovalState.PENDING)
    return {
        "semester": semester.name,
        "pending_approvals": pending.count(),
        "pending_by_stage": dict(
            pending.values_list("current_stage").annotate(n=Count("id")).values_list("current_stage", "n")
        ),
        "venue_clashes": len(all_clashes()),
        "clubs_active": len(active_club_ids),
        "clubs_total": len(clubs),
        "clubs_inactive": [c.name for c in clubs if c.id not in active_club_ids],
        "missing_evidence": missing_evidence,
        "venue_use": list(
            Event.objects.filter(status__in=SLOT_HOLDING)
            .values("venue__name").annotate(bookings=Count("id")).order_by("-bookings")
        ),
        "capture": _capture_overview(done),
    }


def _capture_overview(events):
    """
    Door reliability across the semester. This is the check on the load-bearing
    assumption: every figure derives from attendance, so a poor capture rate is a
    warning that the figures themselves are thin.
    """
    agg = ScanRecord.objects.filter(event__in=events).aggregate(
        attempts=Count("id"), accepted=Count("id", filter=Q(result__in=ACCEPTING))
    )
    attempts = agg["attempts"] or 0
    return {
        "scan_attempts": attempts,
        "scans_accepted": agg["accepted"] or 0,
        "capture_rate": round((agg["accepted"] or 0) / attempts, 3) if attempts else None,
    }
