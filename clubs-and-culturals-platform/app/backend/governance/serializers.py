"""
Response shapes for the governance routes.

The model and request serializers live next to the views (governance/views.py);
these document the computed blocks on an approval card and the plain dicts the
notification and audit views build. Read-only.
"""
from rest_framework import serializers


class ApprovalLineSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    head = serializers.CharField()
    amount_requested = serializers.CharField()
    amount_sanctioned = serializers.CharField(allow_null=True)


class ApprovalClashSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    club = serializers.CharField()
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()
    expected_attendance = serializers.IntegerField()


class UnreadCountSerializer(serializers.Serializer):
    unread = serializers.IntegerField()


class MarkReadSerializer(serializers.Serializer):
    marked = serializers.IntegerField()


class AuditEntryOutSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    actor = serializers.CharField()
    action = serializers.CharField()
    target_type = serializers.CharField()
    target_id = serializers.CharField()
    before = serializers.JSONField()
    after = serializers.JSONField()
    reason = serializers.CharField()
    created_at = serializers.DateTimeField()


class AuditResultsSerializer(serializers.Serializer):
    results = AuditEntryOutSerializer(many=True)
