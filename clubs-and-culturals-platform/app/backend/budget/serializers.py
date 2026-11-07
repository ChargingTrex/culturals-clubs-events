"""
Response shapes for the budget routes.

The model and request serializers live next to the views (budget/views.py);
these document the computed blocks on a budget and the plain dicts the
template view builds. `NilDeclarationSerializer` is shared with governance,
which renders the same block on an approval card. Read-only, except
`ReceiptUploadSerializer`, which documents the multipart body the receipt
upload reads by hand.
"""
from rest_framework import serializers

from budget.models import BudgetTemplateLine


class NilDeclarationSerializer(serializers.Serializer):
    head = serializers.CharField()
    reason = serializers.CharField()
    declared_by = serializers.CharField()
    declared_at = serializers.DateTimeField()


class SettlementProblemSerializer(serializers.Serializer):
    field = serializers.CharField()
    code = serializers.CharField()
    message = serializers.CharField()


class BudgetThresholdsSerializer(serializers.Serializer):
    receipt_threshold = serializers.IntegerField()
    vc_threshold = serializers.IntegerField()


class ReceiptUploadSerializer(serializers.Serializer):
    file = serializers.FileField(help_text="PDF or photograph.")
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    document_date = serializers.DateField(required=False)
    vendor = serializers.CharField(required=False, allow_blank=True)
    supersedes = serializers.UUIDField(required=False, help_text="Receipt this one replaces.")


class TemplateLineSerializer(serializers.Serializer):
    head = serializers.CharField()
    basis = serializers.ChoiceField(choices=BudgetTemplateLine.Basis.choices)
    rate = serializers.CharField()
    amount = serializers.CharField()
    explanation = serializers.CharField()


class ContingencySerializer(serializers.Serializer):
    percent = serializers.IntegerField()
    amount = serializers.CharField()


class BudgetTemplateSerializer(serializers.Serializer):
    name = serializers.CharField()
    event_kind = serializers.CharField()
    lines = TemplateLineSerializer(many=True)
    contingency = ContingencySerializer()
    total_requested = serializers.CharField()
    requires_vc = serializers.BooleanField()
    vc_threshold = serializers.IntegerField()


class BudgetTemplatesSerializer(serializers.Serializer):
    expected_attendance = serializers.IntegerField()
    templates = BudgetTemplateSerializer(many=True)
