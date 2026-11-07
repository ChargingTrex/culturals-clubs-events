"""
Response shapes for the reporting routes.

The routes build plain dicts in reporting/services.py; these serializers are the
documented contract for the parts of them whose meaning is not obvious from the
key alone. They are read-only.
"""
from rest_framework import serializers


class CaptureMetricsSerializer(serializers.Serializer):
    """
    Door reliability for the semester, under two names (MASTER_SPEC §7.6).

    Two different questions were historically answered under one key:

    * `scan_success_rate` — accepted-or-spot scans / all scan attempts
      (`ScanRecord.result IN (accepted, spot_registered)` over every ScanRecord).
      "How many scan attempts succeeded at the door?" A station at 55% is
      rejecting half its queue. This is what the code computed before B-11.

    * `scan_capture_rate` — attended registrations with `source != manual` /
      attended registrations. "Are they scanning, or hand-entering?" A club with a
      persistently low ratio is marking attendance by hand (Database_And_Data_Flow
      §5.6). This is the documents' definition.

    `capture_rate` is kept as an ALIAS of `scan_capture_rate` — the documents'
    definition, not the old code's — so an existing reader of the overview keeps
    working and now gets the documented number. New readers should use the
    explicit names; the alias is scheduled for removal once the React frontend
    reads them.
    """

    scan_attempts = serializers.IntegerField(help_text="Every ScanRecord, failures included.")
    scans_accepted = serializers.IntegerField(help_text="ScanRecords with result accepted or spot_registered.")
    scan_success_rate = serializers.FloatField(
        allow_null=True, help_text="scans_accepted / scan_attempts; null when nothing was scanned.")
    attended = serializers.IntegerField(help_text="Attended, uncancelled registrations.")
    attended_by_scan = serializers.IntegerField(help_text="Of those, with source != manual.")
    scan_capture_rate = serializers.FloatField(
        allow_null=True, help_text="attended_by_scan / attended; null when nobody attended.")
    capture_rate = serializers.FloatField(
        allow_null=True, help_text="Alias of scan_capture_rate (the documents' definition).")


class ReportSemesterSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    starts_on = serializers.DateField()
    ends_on = serializers.DateField()


class ReportByClubSerializer(serializers.Serializer):
    club_id = serializers.UUIDField()
    club = serializers.CharField()
    tag = serializers.CharField()
    category = serializers.CharField()
    events_run = serializers.IntegerField()
    attendance = serializers.IntegerField()
    highlight_photo_url = serializers.CharField(
        allow_null=True, help_text="A photo from the club's best-attended event that has one.")


class ReportByCategorySerializer(serializers.Serializer):
    category = serializers.CharField()
    clubs_active = serializers.IntegerField(
        help_text="Clubs in the category with at least one completed event this semester.")
    events_run = serializers.IntegerField()
    attendance = serializers.IntegerField()


class ReportByDepartmentSerializer(serializers.Serializer):
    department = serializers.CharField()
    students_reached = serializers.IntegerField()
    attendance = serializers.IntegerField()


class ReportMoneySerializer(serializers.Serializer):
    requested = serializers.CharField()
    sanctioned = serializers.CharField()
    spent = serializers.CharField()


class ReportEventSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    club = serializers.CharField()
    starts_at = serializers.DateTimeField()
    attended = serializers.IntegerField()
    registered = serializers.IntegerField()
    photos = serializers.IntegerField()
    social_links = serializers.ListField(child=serializers.CharField())
    sanctioned = serializers.CharField()
    spent = serializers.CharField()


class ReportHighlightSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    club = serializers.CharField()
    starts_at = serializers.DateTimeField()
    attended = serializers.IntegerField()
    outcomes = serializers.CharField(allow_blank=True, help_text="First 200 characters.")
    photo_url = serializers.CharField()


class ReportGalleryPhotoSerializer(serializers.Serializer):
    event_id = serializers.UUIDField()
    event = serializers.CharField()
    club = serializers.CharField()
    caption = serializers.CharField(allow_blank=True)
    photo_url = serializers.CharField()


class ReportOutreachSerializer(serializers.Serializer):
    """PRD §5.14.2: how many events were publicly promoted, and by which clubs."""

    events_promoted = serializers.IntegerField(help_text="Completed events with at least one post link.")
    events_completed = serializers.IntegerField()
    instagram = serializers.IntegerField(help_text="Events with an Instagram post link.")
    linkedin = serializers.IntegerField(help_text="Events with a LinkedIn post link.")
    clubs = serializers.ListField(child=serializers.CharField())


class SemesterReportSerializer(serializers.Serializer):
    """GET /reporting/reports/semester — aggregates only, no individual records."""

    semester = ReportSemesterSerializer()
    events_run = serializers.IntegerField()
    total_participation = serializers.IntegerField()
    unique_students = serializers.IntegerField()
    external_participants = serializers.IntegerField(
        help_text="Counted separately from own students; never summed with them.")
    avg_attendance = serializers.IntegerField()
    by_club = ReportByClubSerializer(many=True)
    by_category = ReportByCategorySerializer(many=True)
    by_department = ReportByDepartmentSerializer(many=True)
    money = ReportMoneySerializer()
    events = ReportEventSerializer(many=True)
    highlights = ReportHighlightSerializer(many=True,
                                           help_text="Up to six best-attended events with a photo.")
    gallery = ReportGalleryPhotoSerializer(many=True, help_text="Every photo marked as a highlight.")
    outreach = ReportOutreachSerializer()
    caveats = serializers.ListField(child=serializers.CharField())


class EscalatedApprovalSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    event_id = serializers.UUIDField()
    event_title = serializers.CharField()
    club = serializers.CharField()
    stage = serializers.CharField()
    age_hours = serializers.FloatField(allow_null=True)
    stage_entered_at = serializers.DateTimeField(allow_null=True)
    submitted_at = serializers.DateTimeField(allow_null=True)


class ChaseEventSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    club = serializers.CharField()


class MissingEvidenceSerializer(ChaseEventSerializer):
    missing = serializers.ListField(child=serializers.CharField())


class MissingReportSerializer(ChaseEventSerializer):
    ended_at = serializers.DateTimeField()


class SocialActivitySerializer(serializers.Serializer):
    club_id = serializers.UUIDField()
    club = serializers.CharField()
    events_completed = serializers.IntegerField()
    events_with_post = serializers.IntegerField()
    share = serializers.FloatField(help_text="events_with_post / events_completed.")
    instagram = serializers.IntegerField()
    linkedin = serializers.IntegerField()
    both = serializers.IntegerField()
    last_post_at = serializers.DateTimeField(allow_null=True)


class VenueUseSerializer(serializers.Serializer):
    venue__name = serializers.CharField()
    bookings = serializers.IntegerField()


class DeanOverviewSerializer(serializers.Serializer):
    """GET /reporting/reports/overview — running totals and what needs chasing."""

    semester = serializers.CharField()
    pending_approvals = serializers.IntegerField()
    pending_by_stage = serializers.DictField(child=serializers.IntegerField())
    escalated_approvals = EscalatedApprovalSerializer(many=True)
    venue_clashes = serializers.IntegerField()
    clubs_active = serializers.IntegerField()
    clubs_total = serializers.IntegerField()
    clubs_inactive = serializers.ListField(child=serializers.CharField())
    dormant_clubs = serializers.IntegerField()
    missing_evidence = MissingEvidenceSerializer(many=True)
    events_missing_photos = ChaseEventSerializer(many=True)
    events_missing_social_links = ChaseEventSerializer(many=True)
    events_missing_report = MissingReportSerializer(
        many=True, help_text="Completed more than REPORT_DUE_DAYS ago and still not closed.")
    social_activity = SocialActivitySerializer(many=True)
    clubs_without_recent_post = serializers.ListField(
        child=serializers.CharField(), help_text="Active clubs with no post link in DORMANCY_DAYS.")
    venue_use = VenueUseSerializer(many=True)
    capture = CaptureMetricsSerializer()
