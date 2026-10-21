import uuid

from django.db import models


class UUIDModel(models.Model):
    """UUID primary keys and timestamps everywhere (AGENT_PROMPT §4)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


MONEY = {"max_digits": 12, "decimal_places": 2}  # NUMERIC(12,2), never float
