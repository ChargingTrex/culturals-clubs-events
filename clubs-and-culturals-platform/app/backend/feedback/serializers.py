"""
Response shapes for the feedback routes.

The request serializer lives next to the view (feedback/views.py); these
document the plain dicts the views build. Read-only.
"""
from rest_framework import serializers

from common.serializers import EventRefSerializer


class FeedbackOutSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    event = serializers.UUIDField()
    rating = serializers.IntegerField()
    would_recommend = serializers.BooleanField()
    comment = serializers.CharField()
    created_at = serializers.DateTimeField()


class FeedbackSummarySerializer(serializers.Serializer):
    """Aggregates and anonymous comments; no ids, names or PRNs."""

    event = EventRefSerializer()
    count = serializers.IntegerField()
    average_rating = serializers.FloatField(allow_null=True)
    recommend_rate = serializers.FloatField(allow_null=True)
    comments = serializers.ListField(child=serializers.CharField())
