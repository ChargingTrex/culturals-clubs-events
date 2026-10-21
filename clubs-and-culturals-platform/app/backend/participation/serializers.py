"""
Response shapes for the participation routes.

The model and request serializers live next to the views (participation/views.py);
these document the plain dicts the views build — the wallet, the door's verdicts
and counters, the station session — so the generated schema says what a client
receives. Read-only, except `RegisterRequestSerializer`, which documents the one
request body the registration view reads by hand.
"""
from rest_framework import serializers

from events.models import EventStatus
from participation.models import ScanResult


class RegisterRequestSerializer(serializers.Serializer):
    event = serializers.UUIDField()


class PassSerializer(serializers.Serializer):
    registration_id = serializers.UUIDField()
    event_id = serializers.UUIDField()
    title = serializers.CharField()
    club = serializers.CharField()
    venue = serializers.CharField()
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()
    attended = serializers.BooleanField()
    waitlisted = serializers.BooleanField()
    token = serializers.CharField(allow_null=True, help_text="null once used, revoked or waitlisted.")
    image = serializers.CharField(allow_null=True, help_text="QR as a data: URI.")


class ProfileQrSerializer(serializers.Serializer):
    token = serializers.CharField()
    version = serializers.IntegerField()
    image = serializers.CharField(help_text="QR as a data: URI.")


class WalletSerializer(serializers.Serializer):
    passes = PassSerializer(many=True)
    profile_qr = ProfileQrSerializer(allow_null=True)
    note = serializers.CharField(required=False)


class PassReissueSerializer(serializers.Serializer):
    token = serializers.CharField()
    image = serializers.CharField(help_text="QR as a data: URI.")


class ScanStudentSerializer(serializers.Serializer):
    prn = serializers.CharField()
    full_name = serializers.CharField()
    department = serializers.CharField()
    programme = serializers.CharField()
    year = serializers.IntegerField()


class ScanOutcomeSerializer(serializers.Serializer):
    """One resolved scan. 200 on every branch; `accepted` says whether they are in."""

    result = serializers.ChoiceField(choices=ScanResult.choices)
    result_label = serializers.CharField()
    verdict = serializers.CharField()
    tone = serializers.ChoiceField(choices=["ok", "warn", "bad"])
    accepted = serializers.BooleanField()
    detail = serializers.CharField()
    student = ScanStudentSerializer(allow_null=True)
    registration_id = serializers.UUIDField(allow_null=True)


class ScanCountersSerializer(serializers.Serializer):
    checked_in = serializers.IntegerField()
    registered = serializers.IntegerField()
    capacity = serializers.IntegerField()


class CaptureStatsSerializer(serializers.Serializer):
    attempts = serializers.IntegerField()
    accepted = serializers.IntegerField()
    duplicates = serializers.IntegerField()
    unknown = serializers.IntegerField()
    wrong_event = serializers.IntegerField()
    expired = serializers.IntegerField()
    capture_rate = serializers.FloatField(allow_null=True)


class ScanStationEventSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    club = serializers.CharField()
    venue = serializers.CharField()
    status = serializers.ChoiceField(choices=EventStatus.choices)
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()


class RecentScanSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    result = serializers.ChoiceField(choices=ScanResult.choices)
    result_label = serializers.CharField()
    scanned_at = serializers.DateTimeField()
    station_id = serializers.CharField()
    was_offline = serializers.BooleanField()
    who = serializers.CharField(allow_null=True)


class ScanStationSerializer(serializers.Serializer):
    event = ScanStationEventSerializer()
    counters = ScanCountersSerializer()
    capture = CaptureStatsSerializer()
    recent = RecentScanSerializer(many=True)


class OfflineSyncSerializer(serializers.Serializer):
    synced = serializers.IntegerField()
    accepted = serializers.IntegerField()
    duplicates = serializers.IntegerField()
    results = ScanOutcomeSerializer(many=True)
    counters = ScanCountersSerializer()


class RosterCountsSerializer(serializers.Serializer):
    registered = serializers.IntegerField()
    waitlisted = serializers.IntegerField()
    attended = serializers.IntegerField()


class ScanSessionSerializer(serializers.Serializer):
    access_token = serializers.CharField()
    token_type = serializers.CharField(help_text="Always `Bearer`.")
    expires_at = serializers.IntegerField(help_text="Unix timestamp.")
    scan_event = serializers.UUIDField()
