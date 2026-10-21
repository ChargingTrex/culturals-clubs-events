"""
Response fragments shared by more than one app's documented shapes.

Read-only and schema-only: the views still build plain dicts. Kept here so the
generated OpenAPI document carries one `EventRef` and one `ClubRef` component
rather than a near-identical copy per app.
"""
from rest_framework import serializers


class EventRefSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()


class ClubRefSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
