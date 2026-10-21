from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.http import FileResponse, HttpResponseRedirect
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_field
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from budget import services
from budget.models import Budget, BudgetLine, BudgetTemplate, ReceiptDocument
from budget.serializers import (
    BudgetTemplatesSerializer, BudgetThresholdsSerializer, NilDeclarationSerializer,
    ReceiptUploadSerializer, SettlementProblemSerializer,
)
from common import roles as R
from common.errors import ProblemDetail


def _money(value):
    return None if value is None else f"{Decimal(value):.2f}"


# Nested-path ids on the line routes, typed for the schema.
_LINE_ID = OpenApiParameter("line_id", OpenApiTypes.UUID, OpenApiParameter.PATH)
_RECEIPT_ID = OpenApiParameter("receipt_id", OpenApiTypes.UUID, OpenApiParameter.PATH)


class ReceiptSerializer(serializers.ModelSerializer):
    is_current = serializers.BooleanField(read_only=True)
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = ReceiptDocument
        fields = ("id", "file_name", "content_type", "byte_size", "amount", "vendor",
                  "document_date", "created_at", "superseded_by", "is_current", "file_url")

    @extend_schema_field(OpenApiTypes.STR)
    def get_file_url(self, receipt):
        return (f"/api/v1/budget/budgets/{receipt.line.budget_id}/lines/"
                f"{receipt.line_id}/receipts/{receipt.id}/file")


class BudgetLineSerializer(serializers.ModelSerializer):
    receipts = serializers.SerializerMethodField()
    is_overspent = serializers.BooleanField(read_only=True)

    class Meta:
        model = BudgetLine
        fields = ("id", "head", "basis", "amount_requested", "amount_sanctioned",
                  "amount_spent", "variance_note", "is_overspent", "receipts", "position")
        read_only_fields = ("id", "amount_requested", "amount_sanctioned")

    @extend_schema_field(ReceiptSerializer(many=True))
    def get_receipts(self, line):
        current = [r for r in line.receipts.all() if r.is_current]
        return ReceiptSerializer(current, many=True).data


class EnvelopeSummarySerializer(serializers.Serializer):
    """Shape of the `envelope` block on a budget; response-only."""

    year = serializers.IntegerField()
    amount = serializers.CharField(allow_null=True)
    sanctioned_to_date = serializers.CharField()
    settled_to_date = serializers.CharField()
    remaining = serializers.CharField(allow_null=True)


class EnvelopeOutSerializer(EnvelopeSummarySerializer):
    club_id = serializers.UUIDField()
    club = serializers.CharField()
    set_by = serializers.CharField(allow_blank=True)
    updated_at = serializers.DateTimeField(allow_null=True)


class BudgetSerializer(serializers.ModelSerializer):
    lines = BudgetLineSerializer(many=True, read_only=True)
    stage_label = serializers.CharField(source="get_stage_display", read_only=True)
    total_requested = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total_sanctioned = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total_spent = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    settlement_problems = serializers.SerializerMethodField()
    thresholds = serializers.SerializerMethodField()
    can_settle = serializers.BooleanField(source="is_settleable", read_only=True)
    settlement_waiting_on = serializers.CharField(read_only=True, allow_null=True)
    settlement_hint = serializers.CharField(read_only=True, allow_null=True)

    nil_declaration = serializers.SerializerMethodField()
    is_editable = serializers.BooleanField(read_only=True)
    is_ready_to_submit = serializers.BooleanField(read_only=True)
    envelope = serializers.SerializerMethodField()

    class Meta:
        model = Budget
        fields = ("id", "event", "fest", "stage", "stage_label", "lines", "total_requested",
                  "total_sanctioned", "total_spent", "settled_at", "settlement_problems",
                  "thresholds", "nil_declaration", "is_editable", "is_ready_to_submit",
                  "can_settle", "settlement_waiting_on", "settlement_hint", "envelope")

    @extend_schema_field(EnvelopeSummarySerializer(allow_null=True))
    def get_envelope(self, budget):
        """
        The club's annual envelope for the year this budget draws on, so the
        officer pricing an event sees what remains without a second call (PRD
        §5.19.5). Anyone who can see the budget can see its envelope; the
        queryset has already excluded everyone else. Cached per (club, year) on
        the shared context, so a list page costs one summary per club.
        """
        if budget.event_id:
            club_id = budget.event.club_id
            year = services.envelope_year_of(budget.event.starts_at)
        elif budget.fest_id:
            club_id, year = budget.fest.club_id, budget.fest.starts_on.year
        else:
            return None
        cache = self.context.setdefault("_envelopes", {})
        key = (str(club_id), year)
        if key not in cache:
            summary = services.envelope_summary(club_id, year)
            cache[key] = {
                "year": year,
                "amount": _money(summary["amount"]),
                "sanctioned_to_date": _money(summary["sanctioned_to_date"]),
                "settled_to_date": _money(summary["settled_to_date"]),
                "remaining": _money(summary["remaining"]),
            }
        return cache[key]


    @extend_schema_field(NilDeclarationSerializer(allow_null=True))
    def get_nil_declaration(self, budget):
        """
        Present as an explicit entry, not an absent one.

        The client renders this where the line table would be, so a zero-cost event
        reads as a statement somebody made rather than a blank nobody filled in.
        """
        if not budget.is_nil:
            return None
        return {
            "head": "No budget required",
            "reason": budget.nil_reason,
            "declared_by": budget.nil_declared_by_label,
            "declared_at": budget.nil_declared_at,
        }

    @extend_schema_field(SettlementProblemSerializer(many=True))
    def get_settlement_problems(self, budget):
        """
        What blocks settlement, once settlement is actually the next step.

        Empty before then. Listing "enter what was spent" against a draft budget
        presents the normal order of work as a fault.
        """
        return services.settlement_problems(budget)

    @extend_schema_field(BudgetThresholdsSerializer)
    def get_thresholds(self, budget):
        return {"receipt_threshold": settings.RECEIPT_THRESHOLD,
                "vc_threshold": settings.VC_BUDGET_THRESHOLD}


class LineSerializer(serializers.Serializer):
    head = serializers.CharField(max_length=120)
    amount_requested = serializers.DecimalField(max_digits=12, decimal_places=2)
    basis = serializers.CharField(required=False, allow_blank=True)


class LineEditSerializer(serializers.Serializer):
    head = serializers.CharField(max_length=120, required=False)
    amount_requested = serializers.DecimalField(max_digits=12, decimal_places=2,
                                                required=False)
    basis = serializers.CharField(required=False, allow_blank=True)


class NilSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=400)


class SpendSerializer(serializers.Serializer):
    amount_spent = serializers.DecimalField(max_digits=12, decimal_places=2,
                                            allow_null=True, required=False)
    variance_note = serializers.CharField(required=False, allow_blank=True, max_length=400)


class BudgetViewSet(viewsets.GenericViewSet):
    serializer_class = BudgetSerializer
    # Schema hint only: drf-spectacular types the `id` path parameter from the
    # model. Every request goes through get_queryset(), which scopes it.
    queryset = Budget.objects.none()

    def get_queryset(self):
        """
        Budget visibility: President, Vice-President and Treasurer of that club,
        plus staff. A club member is deliberately excluded (AGENT_PROMPT §6), and
        because the exclusion is in the queryset they get 404 rather than 403 —
        the existence of another club's budget is itself disclosure.
        """
        ctx = self.request.auth_context
        qs = (Budget.objects
              .select_related("event__club", "fest__club")
              .prefetch_related("lines__receipts"))
        if ctx.can_see_all_clubs():
            return qs
        clubs = ctx.scopes_for(*R.BUDGET_VIEWERS)
        if not clubs:
            return qs.none()
        from django.db.models import Q

        return qs.filter(Q(event__club_id__in=clubs) | Q(fest__club_id__in=clubs))

    def _get(self, pk):
        budget = self.get_queryset().filter(pk=pk).first()
        if budget is None:
            raise ProblemDetail(code="NOT_FOUND", title="Not found", status_code=404,
                                detail="No such budget, or it is not visible to you.")
        return budget

    def list(self, request):
        page = self.paginate_queryset(self.get_queryset())
        return self.get_paginated_response(
            BudgetSerializer(page, many=True, context={"request": request}).data)

    def retrieve(self, request, pk=None):
        return Response(BudgetSerializer(self._get(pk), context={"request": request}).data)

    def _require_settler(self, budget):
        ctx = self.request.auth_context
        club_id = budget.event.club_id if budget.event_id else budget.fest.club_id
        if not ctx.has_club_role(club_id, *R.BUDGET_SETTLERS):
            raise ProblemDetail(
                code="BUDGET_SPEND_DENIED", title="Not permitted",
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the club's President or Treasurer may enter spend.",
            )
        return ctx

    def _require_preparer(self, budget):
        """
        Who may build the budget. The Treasurer is the point of this set — PRD §4
        makes preparing budget requests their job, so they add the entries rather
        than only filling in spend against entries somebody else typed.
        """
        ctx = self.request.auth_context
        club_id = budget.event.club_id if budget.event_id else budget.fest.club_id
        if not ctx.has_club_role(club_id, *R.BUDGET_PREPARERS):
            raise ProblemDetail(
                code="BUDGET_PREPARE_DENIED", title="Not permitted",
                status_code=status.HTTP_403_FORBIDDEN,
                detail=("Only the club's President, Vice-President or Treasurer may "
                        "build the budget."),
            )
        return ctx

    def _line_or_404(self, budget, line_id):
        line = budget.lines.filter(pk=line_id).first()
        if line is None:
            raise ProblemDetail(code="NOT_FOUND", title="Not found", status_code=404,
                                detail="No such budget line on this budget.")
        return line

    @extend_schema(request=LineSerializer, responses={201: BudgetSerializer},
                   summary="Add a budget line")
    @action(detail=True, methods=["post"], url_path="lines")
    def add_line(self, request, pk=None):
        budget = self._get(pk)
        self._require_preparer(budget)
        data = LineSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.add_line(budget, head=data.validated_data["head"],
                          amount_requested=data.validated_data["amount_requested"],
                          basis=data.validated_data.get("basis") or None)
        budget.refresh_from_db()
        return Response(BudgetSerializer(budget, context={"request": request}).data,
                        status=status.HTTP_201_CREATED)

    @extend_schema(request=LineEditSerializer, responses=BudgetSerializer, parameters=[_LINE_ID],
                   summary="Edit a budget line's head or amount")
    @action(detail=True, methods=["put"], url_path=r"lines/(?P<line_id>[0-9a-f-]+)/edit")
    def edit_line(self, request, pk=None, line_id=None):
        budget = self._get(pk)
        self._require_preparer(budget)
        line = self._line_or_404(budget, line_id)
        data = LineEditSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        services.update_line(budget, line, **{k: v for k, v in data.validated_data.items()})
        budget.refresh_from_db()
        return Response(BudgetSerializer(budget, context={"request": request}).data)

    @extend_schema(responses={200: BudgetSerializer}, parameters=[_LINE_ID],
                   summary="Remove a budget line before submission")
    @action(detail=True, methods=["delete"], url_path=r"lines/(?P<line_id>[0-9a-f-]+)/remove")
    def remove_line(self, request, pk=None, line_id=None):
        budget = self._get(pk)
        self._require_preparer(budget)
        line = self._line_or_404(budget, line_id)
        services.delete_line(budget, line)
        budget.refresh_from_db()
        return Response(BudgetSerializer(budget, context={"request": request}).data)

    @extend_schema(request=NilSerializer, responses=BudgetSerializer,
                   summary="Declare that the event needs no budget")
    @action(detail=True, methods=["post"], url_path="declare-nil")
    def declare_nil(self, request, pk=None):
        budget = self._get(pk)
        ctx = self._require_preparer(budget)
        data = NilSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.declare_nil(budget, reason=data.validated_data["reason"], actor=ctx)
        budget.refresh_from_db()
        return Response(BudgetSerializer(budget, context={"request": request}).data)

    @extend_schema(request=None, responses=BudgetSerializer,
                   summary="Withdraw a nil declaration so the budget can be priced")
    @action(detail=True, methods=["post"], url_path="withdraw-nil")
    def withdraw_nil(self, request, pk=None):
        budget = self._get(pk)
        ctx = self._require_preparer(budget)
        services.withdraw_nil(budget, actor=ctx)
        budget.refresh_from_db()
        return Response(BudgetSerializer(budget, context={"request": request}).data)

    @extend_schema(request=SpendSerializer, responses=BudgetSerializer, parameters=[_LINE_ID],
                   summary="Record spend on one budget line")
    @action(detail=True, methods=["patch"], url_path=r"lines/(?P<line_id>[0-9a-f-]+)")
    def set_spend(self, request, pk=None, line_id=None):
        budget = self._get(pk)
        self._require_settler(budget)
        line = budget.lines.filter(pk=line_id).first()
        if line is None:
            raise ProblemDetail(code="NOT_FOUND", title="Not found", status_code=404,
                                detail="No such budget line on this budget.")
        from budget.models import BudgetStage

        if budget.stage == BudgetStage.SETTLED:
            raise ProblemDetail(
                code="BUDGET_ALREADY_SETTLED", title="Already settled", status_code=409,
                detail="A settled budget is closed. A correction needs the Dean to reopen it.",
            )
        data = SpendSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        if "amount_spent" in data.validated_data:
            line.amount_spent = data.validated_data["amount_spent"]
        if "variance_note" in data.validated_data:
            line.variance_note = data.validated_data["variance_note"]
        line.save(update_fields=["amount_spent", "variance_note", "updated_at"])
        return Response(BudgetSerializer(budget, context={"request": request}).data)

    @extend_schema(request={"multipart/form-data": ReceiptUploadSerializer},
                   responses={201: ReceiptSerializer}, parameters=[_LINE_ID],
                   summary="Attach a receipt to one budget line")
    @action(detail=True, methods=["post"],
            url_path=r"lines/(?P<line_id>[0-9a-f-]+)/receipts")
    def attach_receipt(self, request, pk=None, line_id=None):
        budget = self._get(pk)
        ctx = self._require_settler(budget)
        line = budget.lines.filter(pk=line_id).first()
        if line is None:
            raise ProblemDetail(code="NOT_FOUND", title="Not found", status_code=404,
                                detail="No such budget line on this budget.")
        upload = request.FILES.get("file")
        if upload is None:
            raise ProblemDetail(code="BUDGET_RECEIPT_MISSING", title="No file supplied",
                                status_code=422, detail="Attach a photo or a PDF.",
                                errors=[{"field": "file", "code": "REQUIRED",
                                         "message": "A file is required."}])
        if not services.is_allowed_receipt_type(upload.content_type):
            raise ProblemDetail(
                code="BUDGET_RECEIPT_TYPE", title="Unsupported file type", status_code=422,
                detail=("Receipts must be a PDF or a photograph: "
                        + ", ".join(services.RECEIPT_CONTENT_TYPES) + "."),
                errors=[{"field": "file", "code": "CONTENT_TYPE",
                         "message": upload.content_type or ""}],
            )
        amount = None
        if raw := request.data.get("amount"):
            try:
                amount = Decimal(str(raw))
            except (InvalidOperation, TypeError):
                raise ProblemDetail(code="BUDGET_RECEIPT_AMOUNT", title="Unreadable amount",
                                    status_code=422, detail=f"{raw!r} is not an amount.")
        document_date = None
        if raw := request.data.get("document_date"):
            try:
                document_date = serializers.DateField().to_internal_value(raw)
            except serializers.ValidationError:
                raise ProblemDetail(code="BUDGET_RECEIPT_DATE", title="Unreadable date",
                                    status_code=422,
                                    detail=f"{raw!r} is not a date (use YYYY-MM-DD).")
        supersedes = None
        if replaced := request.data.get("supersedes"):
            supersedes = line.receipts.filter(pk=replaced).first()
        receipt = services.attach_receipt(
            line, file_name=upload.name, content=upload.read(),
            content_type=upload.content_type or "application/octet-stream",
            amount=amount, uploaded_by_sub=ctx.sub, supersedes=supersedes,
            vendor=request.data.get("vendor") or "", document_date=document_date,
        )
        return Response(ReceiptSerializer(receipt).data, status=status.HTTP_201_CREATED)

    @extend_schema(responses={(200, "*/*"): OpenApiTypes.BINARY, 302: None},
                   parameters=[_LINE_ID, _RECEIPT_ID],
                   summary="The stored receipt file, with its original content type")
    @action(detail=True, methods=["get"],
            url_path=r"lines/(?P<line_id>[0-9a-f-]+)/receipts/(?P<receipt_id>[0-9a-f-]+)/file")
    def receipt_file(self, request, pk=None, line_id=None, receipt_id=None):
        """
        PRD §5.19.4: the people reviewing a settlement can open the attachment.

        Who: the queryset already limits budgets to BUDGET_VIEWERS of the club and
        to staff (Dean, Cultural Society, Vice-Chancellor, admin), so a plain
        member is 404 here as everywhere else on the budget. The VC may see a
        receipt: it is a vendor's bill and carries no student data. A superseded
        receipt is still served — the old row is evidence of what was first
        claimed, which is the whole reason it was kept.
        """
        budget = self._get(pk)
        line = self._line_or_404(budget, line_id)
        receipt = line.receipts.filter(pk=receipt_id).first()
        if receipt is None:
            raise ProblemDetail(code="NOT_FOUND", title="Not found", status_code=404,
                                detail="No such receipt on this line.")
        location = services.receipt_location(receipt)
        if location["kind"] == "redirect":
            response = HttpResponseRedirect(location["url"])
            response["Cache-Control"] = "private, no-store"
            return response
        path = location["path"]
        if not path.is_file():
            raise ProblemDetail(code="BUDGET_RECEIPT_FILE_MISSING", title="File not found",
                                status_code=404,
                                detail="The receipt's file is no longer in the store.")
        # Only the upload allowlist is rendered inline. Anything else — rows
        # stored before the allowlist was exact, or a type the store relabelled
        # — goes out as an opaque download, so it can never execute on this
        # origin. The sandbox CSP is the backstop for the inline types.
        inline = services.is_allowed_receipt_type(receipt.content_type)
        response = FileResponse(
            open(path, "rb"),
            content_type=receipt.content_type if inline else "application/octet-stream",
            filename=receipt.file_name, as_attachment=not inline,
        )
        response["Content-Length"] = path.stat().st_size
        response["X-Content-Type-Options"] = "nosniff"
        response["Content-Security-Policy"] = "sandbox"
        response["Cache-Control"] = "private, no-store"
        return response

    @extend_schema(request=None, responses=BudgetSerializer,
                   summary="Settle the budget once spend and evidence are complete")
    @action(detail=True, methods=["post"])
    def settle(self, request, pk=None):
        budget = self._get(pk)
        ctx = self._require_settler(budget)
        services.settle(budget, actor=ctx)
        return Response(BudgetSerializer(budget, context={"request": request}).data)


class EnvelopeSetSerializer(serializers.Serializer):
    year = serializers.IntegerField(min_value=services.ENVELOPE_YEAR_MIN,
                                    max_value=services.ENVELOPE_YEAR_MAX)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal("0"))


class EnvelopeView(APIView):
    """
    A club's annual envelope with running utilisation (PRD §5.7.3, §5.19.5).

    GET: BUDGET_VIEWERS of that club, Dean, Cultural Society, Vice-Chancellor,
    admin. Everyone else — including the club's own plain members, who have no
    budget visibility (AGENT_PROMPT §6) — gets 404, the same as for the budgets
    the figure is made of.

    PUT: Dean or admin. PRD §5.13 names the Student Life Office as the body that
    configures approval behaviour, but no such role exists in common/roles.py
    yet, so the Dean sets the envelope until it does.
    """

    serializer_class = EnvelopeOutSerializer

    def _club_or_404(self, request, club_id):
        from clubs.models import Club

        ctx = request.auth_context
        club = Club.objects.filter(pk=club_id).first()
        if club is None or not (ctx.can_see_all_clubs()
                                or ctx.has_club_role(club_id, *R.BUDGET_VIEWERS)):
            raise ProblemDetail(code="NOT_FOUND", title="Not found", status_code=404,
                                detail="No such club, or its envelope is not visible to you.")
        return club

    def _year(self, request):
        raw = request.query_params.get("year")
        if raw is None or raw == "":
            return services.current_envelope_year()
        return services.validate_envelope_year(raw)

    @extend_schema(responses=EnvelopeOutSerializer,
                   summary="Annual envelope and utilisation for one club")
    def get(self, request, club_id):
        club = self._club_or_404(request, club_id)
        summary = services.envelope_summary(club.pk, self._year(request))
        return Response(_envelope_out(club, summary))

    @extend_schema(request=EnvelopeSetSerializer, responses=EnvelopeOutSerializer,
                   summary="Set the envelope for a year")
    def put(self, request, club_id):
        club = self._club_or_404(request, club_id)
        ctx = request.auth_context
        if not ctx.has_any(R.DEAN, R.ADMIN):
            raise ProblemDetail(
                code="BUDGET_ENVELOPE_DENIED", title="Not permitted",
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the Dean or an administrator may set a club's envelope.",
            )
        data = EnvelopeSetSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.set_envelope(club, year=data.validated_data["year"],
                              amount=data.validated_data["amount"], actor=ctx,
                              actor_user=request.user.record)
        summary = services.envelope_summary(club.pk, data.validated_data["year"])
        return Response(_envelope_out(club, summary))


def _envelope_out(club, summary):
    return {
        "club_id": str(club.pk),
        "club": club.name,
        "year": summary["year"],
        "amount": _money(summary["amount"]),
        "sanctioned_to_date": _money(summary["sanctioned_to_date"]),
        "settled_to_date": _money(summary["settled_to_date"]),
        "remaining": _money(summary["remaining"]),
        "set_by": summary["set_by"],
        "updated_at": summary["updated_at"],
    }


class BudgetTemplateView(APIView):
    """
    Templates, with the amounts a club would get for a given headcount.

    The preview is computed server-side so the figure a club sees while proposing
    is the figure that will be created — the prototype computed it in the browser,
    which meant two implementations of the same arithmetic.
    """

    @extend_schema(
        parameters=[OpenApiParameter("expected_attendance", OpenApiTypes.INT, OpenApiParameter.QUERY,
                                     description="Headcount to price per-head lines at (default 80).")],
        responses=BudgetTemplatesSerializer,
        summary="Budget templates, priced for an expected attendance",
    )
    def get(self, request):
        try:
            expected = max(1, int(request.query_params.get("expected_attendance", 80)))
        except ValueError:
            expected = 80
        out = []
        for template in BudgetTemplate.objects.prefetch_related("lines"):
            lines, subtotal = [], Decimal("0")
            for line in template.lines.all():
                amount = line.amount_for(expected_attendance=expected)
                subtotal += amount
                lines.append({
                    "head": line.head, "basis": line.basis, "rate": str(line.rate),
                    "amount": str(amount),
                    "explanation": (f"{line.rate} x {expected}"
                                    if line.basis == line.Basis.PER_HEAD else "lump sum"),
                })
            percent = template.contingency_percent or settings.CONTINGENCY_PERCENT
            contingency = (subtotal * Decimal(percent) / Decimal(100)).quantize(Decimal("0.01"))
            total = subtotal + contingency
            out.append({
                "name": template.name, "event_kind": template.event_kind, "lines": lines,
                "contingency": {"percent": percent, "amount": str(contingency)},
                "total_requested": str(total),
                # Told up front, so a club knows before submitting that its
                # proposal will take two gates rather than one.
                "requires_vc": total > settings.VC_BUDGET_THRESHOLD,
                "vc_threshold": settings.VC_BUDGET_THRESHOLD,
            })
        return Response({"expected_attendance": expected, "templates": out})
