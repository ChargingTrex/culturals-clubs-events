"""
Scan station endpoints.

Adds what neither source project has: an offline queue that survives a venue
with no signal and replays safely on reconnect.

The Apps Script original needs live connectivity for every scan — the sheet
write *is* the check-in. A hall with weak coverage means the station stops
working mid-queue, and the club falls back to a paper list. That is the
failure that makes every downstream figure untrustworthy, so it is handled
here explicitly rather than hoped away.
"""

from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from scanner.services import ScanService, ScanResult
from scanner.permissions import IsEventOrganiser


def _payload(outcome) -> dict:
    """Shape returned to the station. Kept flat and small — it is rendered
    by a phone browser between two people walking through a door."""
    return {
        "result": outcome.result.value,
        "ok": outcome.ok,
        "message": outcome.message,
        "student": {
            "display_name": outcome.student_name,
            "prn": outcome.prn,
            "programme": outcome.programme,
            "year": outcome.year,
        },
        "checked_in_at": outcome.checked_in_at.isoformat() if outcome.checked_in_at else None,
        "previous_check_in": (
            outcome.previous_check_in.isoformat() if outcome.previous_check_in else None
        ),
        "registration_id": outcome.registration_id,
    }


class ScanView(APIView):
    """
    POST /api/v1/participation/events/{event_id}/scan

    Body: {"token": "...", "station_id": "GATE-2"}
    """

    permission_classes = [IsAuthenticated, IsEventOrganiser]

    def post(self, request, event_id):
        from clubs.models import Event            # local import: models owned by S1
        from participation.models import (
            Registration, EventPass, ScanRecord,
        )
        from sis.models import Student

        event = Event.objects.get(id=event_id)
        token = (request.data.get("token") or "").strip()
        station_id = request.data.get("station_id") or "unknown"

        if not token:
            return Response(
                {"code": "PARTICIPATION_MISSING_TOKEN", "detail": "No token supplied."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        service = ScanService(
            Registration=Registration,
            Student=Student,
            EventPass=EventPass,
            ScanRecord=ScanRecord,
        )
        outcome = service.scan(
            raw_token=token,
            event=event,
            operator_id=request.user.id,
            station_id=station_id,
            allow_spot_registration=request.data.get("allow_spot", True),
        )

        # A duplicate is not a server error — it is a correct, expected answer
        # that the operator needs to see. 200 with a result field, not 409,
        # because the station renders every outcome the same way.
        return Response(_payload(outcome), status=status.HTTP_200_OK)


class OfflineSyncView(APIView):
    """
    POST /api/v1/participation/events/{event_id}/scan/sync

    Body: {"scans": [{"token": "...", "scanned_at": "...", "client_ref": "..."}],
           "station_id": "GATE-2"}

    Replays a station's offline queue. Ordered by the device's own timestamp so
    that when two stations were both offline and scanned the same student, the
    earliest genuine scan wins and the later one is recorded as a duplicate —
    matching what would have happened had both been online.
    """

    permission_classes = [IsAuthenticated, IsEventOrganiser]

    MAX_BATCH = 500

    def post(self, request, event_id):
        from clubs.models import Event
        from participation.models import Registration, EventPass, ScanRecord
        from sis.models import Student
        from django.utils.dateparse import parse_datetime

        scans = request.data.get("scans") or []
        if len(scans) > self.MAX_BATCH:
            return Response(
                {
                    "code": "PARTICIPATION_BATCH_TOO_LARGE",
                    "detail": f"Send at most {self.MAX_BATCH} scans per request.",
                },
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        event = Event.objects.get(id=event_id)
        station_id = request.data.get("station_id") or "unknown"

        service = ScanService(
            Registration=Registration,
            Student=Student,
            EventPass=EventPass,
            ScanRecord=ScanRecord,
        )

        # Sort by device time before replay. Without this, the order the queue
        # happened to upload in would decide who counts as the duplicate.
        ordered = sorted(scans, key=lambda s: s.get("scanned_at") or "")

        results = []
        for item in ordered:
            token = (item.get("token") or "").strip()
            scanned_at = parse_datetime(item.get("scanned_at") or "") if item.get("scanned_at") else None

            if not token:
                results.append({
                    "client_ref": item.get("client_ref"),
                    "result": ScanResult.UNKNOWN_CODE.value,
                    "ok": False,
                })
                continue

            outcome = service.scan(
                raw_token=token,
                event=event,
                operator_id=request.user.id,
                station_id=station_id,
                scanned_at=scanned_at,
                allow_spot_registration=item.get("allow_spot", True),
            )
            entry = _payload(outcome)
            entry["client_ref"] = item.get("client_ref")
            results.append(entry)

        accepted = sum(1 for r in results if r.get("ok"))
        return Response(
            {
                "received": len(scans),
                "accepted": accepted,
                "duplicates": sum(
                    1 for r in results if r.get("result") == ScanResult.DUPLICATE.value
                ),
                "results": results,
            },
            status=status.HTTP_200_OK,
        )


class EventRosterView(APIView):
    """
    GET /api/v1/participation/events/{event_id}/roster

    The station caches this before going offline, and it backs the PRN/name
    search fallback when a student has no phone. Paginated, because a fest
    sub-event can have a few thousand registrations.
    """

    permission_classes = [IsAuthenticated, IsEventOrganiser]

    def get(self, request, event_id):
        from participation.models import Registration

        qs = (
            Registration.objects.filter(event_id=event_id, cancelled_at__isnull=True)
            .select_related("student")
            .order_by("student__display_name")
        )

        search = request.query_params.get("q")
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(student__prn__icontains=search)
                | Q(student__display_name__icontains=search)
            )

        return Response({
            "count": qs.count(),
            "results": [
                {
                    "registration_id": str(r.id),
                    "prn": r.student.prn,
                    "display_name": r.student.display_name,
                    "programme": r.student.programme,
                    "year": r.student.year_of_study,
                    "attended": r.attended,
                    "checked_in_at": r.checked_in_at.isoformat() if r.checked_in_at else None,
                }
                for r in qs[:2000]
            ],
        })
