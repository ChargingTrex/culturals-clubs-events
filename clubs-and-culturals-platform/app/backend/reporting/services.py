"""
Semester report aggregation.

AGENT_PROMPT §5 gives these definitions exactly. `unique_students` is the
headline figure: 20 events attended by the same 80 students and 20 events
reaching 600 both give total_participation = 1600, and only the DISTINCT count
separates them. tests/test_reporting.py checks it against a dataset with known,
deliberate overlap rather than assuming the query is right because it runs.
"""
from decimal import Decimal
from uuid import UUID

from django.db.models import Count, Q, Sum

from events.models import REPORTABLE, SLOT_HOLDING, Event
from participation.models import ACCEPTING, Registration, ScanRecord

_ATTENDED = Q(registrations__attended=True, registrations__cancelled_at__isnull=True)


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
        .annotate(events_run=Count("id", distinct=True),
                  attendance=Count("registrations", filter=_ATTENDED))
        .order_by("-attendance")
    )

    # PRD §6.2 asks for the split by club category (cultural, technical, ...);
    # `by_club` carries each club's category too, this is the roll-up of it.
    # `clubs_active` = clubs in the category with at least one completed event
    # this semester — not the number of clubs registered in the category.
    by_category = list(
        events.values("club__category")
        .annotate(clubs_active=Count("club_id", distinct=True),
                  events_run=Count("id", distinct=True),
                  attendance=Count("registrations", filter=_ATTENDED))
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
        "by_category": [
            {"category": row["club__category"], "clubs_active": row["clubs_active"],
             "events_run": row["events_run"], "attendance": row["attendance"]}
            for row in by_category
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
    from events.services import all_clashes
    from governance.models import ApprovalRequest, ApprovalState
    from clubs.models import Club

    in_semester = Event.objects.filter(
        starts_at__date__gte=semester.starts_on, starts_at__date__lte=semester.ends_on
    )
    done = list(in_semester.filter(status__in=REPORTABLE).select_related("club"))
    # Evidence chasing (PRD §6.3): a closed event with no photos or no post link
    # is the gap that makes a semester report thinner than the semester was.
    # `missing_evidence` is the combined list; the two per-gap lists let the
    # dashboard chase each kind separately.
    missing_evidence = [
        {**_chase(e),
         "missing": [m for m in (("photos" if not e.photo_count else None),
                                 ("social post link" if not e.social_links else None)) if m]}
        for e in done if not e.photo_count or not e.social_links
    ]
    events_missing_photos = [_chase(e) for e in done if not e.photo_count]
    events_missing_social_links = [_chase(e) for e in done if not e.social_links]

    active_club_ids = {e.club_id for e in done}
    clubs = list(Club.objects.filter(status=Club.Status.ACTIVE))

    pending = ApprovalRequest.objects.filter(state=ApprovalState.PENDING)
    return {
        "semester": semester.name,
        "pending_approvals": pending.count(),
        "pending_by_stage": dict(
            pending.values_list("current_stage").annotate(n=Count("id")).values_list("current_stage", "n")
        ),
        "escalated_approvals": escalated_approvals(),
        "venue_clashes": len(all_clashes()),
        "clubs_active": len(active_club_ids),
        "clubs_total": len(clubs),
        # Proxy: active clubs with nothing completed this semester. Distinct from
        # `dormant_clubs`, which counts clubs the dormancy job has actually flagged.
        "clubs_inactive": [c.name for c in clubs if c.id not in active_club_ids],
        "dormant_clubs": Club.objects.filter(status=Club.Status.DORMANT).count(),
        "missing_evidence": missing_evidence,
        "events_missing_photos": events_missing_photos,
        "events_missing_social_links": events_missing_social_links,
        "venue_use": list(
            Event.objects.filter(status__in=SLOT_HOLDING)
            .values("venue__name").annotate(bookings=Count("id")).order_by("-bookings")
        ),
        "capture": capture_metrics(done),
    }


def _chase(event):
    return {"id": str(event.id), "title": event.title, "club": event.club.name}


def capture_metrics(events):
    """
    Door reliability across the semester, under two names (MASTER_SPEC §7.6).

    Every figure in the report derives from attendance records, so a poor capture
    rate is a warning that the figures themselves are thin. The documents and the
    code historically computed different things under one name; both are useful
    and both are shipped, named for what they measure:

      scan_success_rate = accepted-or-spot scans / all scan attempts
          "how many scan attempts succeeded at the door?" (what the code computed)
      scan_capture_rate = attended registrations with source != manual / attended
          "are they scanning, or hand-entering?" (Database_And_Data_Flow §5.6)

    `capture_rate` is kept as an alias of `scan_capture_rate` — the documents'
    definition — see reporting/serializers.py.
    """
    scans = ScanRecord.objects.filter(event__in=events).aggregate(
        attempts=Count("id"), accepted=Count("id", filter=Q(result__in=ACCEPTING))
    )
    attended = Registration.objects.filter(
        event__in=events, attended=True, cancelled_at__isnull=True
    ).aggregate(
        total=Count("id"),
        by_scan=Count("id", filter=~Q(source=Registration.Source.MANUAL)),
    )
    attempts = scans["attempts"] or 0
    accepted = scans["accepted"] or 0
    attended_total = attended["total"] or 0
    attended_by_scan = attended["by_scan"] or 0
    scan_success_rate = round(accepted / attempts, 3) if attempts else None
    scan_capture_rate = round(attended_by_scan / attended_total, 3) if attended_total else None
    return {
        "scan_attempts": attempts,
        "scans_accepted": accepted,
        "scan_success_rate": scan_success_rate,
        "attended": attended_total,
        "attended_by_scan": attended_by_scan,
        "scan_capture_rate": scan_capture_rate,
        "capture_rate": scan_capture_rate,
    }


# ---------------------------------------------------------------------------
# SLA escalation (B-07, W3) — read defensively until it is merged
# ---------------------------------------------------------------------------

def escalated_approvals():
    """Approvals past the SLA, for the overview; `[]` until B-07 is wired."""
    try:
        # TODO(orchestrator, B-07): provided by W3's governance/services.py; wire at merge.
        from governance.services import escalated_requests
    except ImportError:
        return []
    return [escalation_summary(item) for item in escalated_requests()]


def escalation_summary(item):
    """
    One escalated approval as the overview and the SLA job present it.

    `governance.services.escalated_requests` is not in this build yet, so its row
    shape is unknown: an ApprovalRequest instance or a dict are both accepted.
    Labels and ages only — an approval has no student fields, so nothing here can
    leak a name or a PRN.
    """
    get = item.get if isinstance(item, dict) else (lambda key, default=None: getattr(item, key, default))
    event = get("event")
    event_id = getattr(event, "id", None) or get("event_id") or (event if isinstance(event, (str, UUID)) else None)
    # The age is stage-based (B-07: the clock restarts at each gate), so the
    # timestamp reported beside it is the one it is measured from. No fallback to
    # created_at: that would quietly report a different clock.
    age = get("age_hours")
    if callable(age):
        age = age()
    return {
        "id": str(get("id") or ""),
        "event_id": str(event_id or ""),
        "event_title": getattr(event, "title", None) or get("event_title") or "",
        "club": getattr(getattr(event, "club", None), "name", None) or get("club") or "",
        "stage": get("current_stage") or get("stage") or "",
        "age_hours": round(float(age), 1) if age is not None else None,
        "stage_entered_at": get("stage_entered_at"),
        "submitted_at": get("created_at") or get("submitted_at"),
    }
