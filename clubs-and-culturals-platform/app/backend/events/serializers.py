from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from budget.models import BudgetStage
from common import roles as R
from common.serializers import EventRefSerializer
from participation.services import live_pass
from events.models import (
    Event, EventOrganiser, EventPhoto, EventSocialPost, EventStatus, Fest, Venue, VenueReassignment,
)


class VenueSerializer(serializers.ModelSerializer):
    class Meta:
        model = Venue
        fields = ("id", "name", "capacity", "location", "active")


class BudgetSummarySerializer(serializers.Serializer):
    """The `budget` block on an event; present only for roles with budget visibility."""

    id = serializers.UUIDField()
    stage = serializers.ChoiceField(choices=BudgetStage.choices)
    stage_label = serializers.CharField()
    total_requested = serializers.CharField()
    total_sanctioned = serializers.CharField()
    total_spent = serializers.CharField()


class MyRegistrationSerializer(serializers.Serializer):
    """The caller's own live registration on an event, if any."""

    id = serializers.UUIDField()
    attended = serializers.BooleanField()
    pass_token = serializers.CharField(allow_null=True)


class EventSerializer(serializers.ModelSerializer):
    club_name = serializers.CharField(source="club.name", read_only=True)
    venue_name = serializers.CharField(source="venue.name", read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    # Read from EventPhoto / EventSocialPost rows; kept under the old names so
    # existing readers (overview, report, CSV) did not have to change.
    photo_count = serializers.IntegerField(read_only=True)
    social_links = serializers.ListField(child=serializers.URLField(), read_only=True)
    highlight_photo_url = serializers.SerializerMethodField()
    registered = serializers.SerializerMethodField()
    attended = serializers.SerializerMethodField()
    budget = serializers.SerializerMethodField()
    my_registration = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = ("id", "title", "club", "club_name", "fest", "kind", "description",
                  "venue", "venue_name", "starts_at", "ends_at", "capacity",
                  "expected_attendance", "status", "status_label", "photo_count",
                  "social_links", "highlight_photo_url", "registered", "attended", "budget",
                  "my_registration", "submitted_at", "closed_at")
        read_only_fields = ("id", "status", "photo_count", "social_links", "submitted_at",
                            "closed_at")

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_highlight_photo_url(self, event):
        """The first highlight, else the first photo: what a card shows."""
        photos = [p for p in event.photos.all() if p.removed_at is None]
        chosen = next((p for p in photos if p.is_highlight), photos[0] if photos else None)
        return photo_file_url(chosen) if chosen else None

    @extend_schema_field(serializers.IntegerField())
    def get_registered(self, event):
        return event.registered_count()

    @extend_schema_field(serializers.IntegerField())
    def get_attended(self, event):
        return event.attended_count()

    @extend_schema_field(BudgetSummarySerializer(allow_null=True))
    def get_budget(self, event):
        """
        Budget totals are shown only to the roles allowed to see them.

        AGENT_PROMPT §6: a club member has no budget visibility. Omitting the key
        entirely rather than nulling it means a client cannot infer an amount from
        the shape of the response.
        """
        ctx = self.context["request"].auth_context
        budget = getattr(event, "budget", None)
        if budget is None:
            return None
        allowed = (ctx.can_see_all_clubs()
                   or ctx.has_club_role(event.club_id, *R.BUDGET_VIEWERS))
        if not allowed:
            return None
        return {
            "id": str(budget.id), "stage": budget.stage,
            "stage_label": budget.get_stage_display(),
            "total_requested": str(budget.total_requested),
            "total_sanctioned": str(budget.total_sanctioned),
            "total_spent": str(budget.total_spent),
        }

    @extend_schema_field(MyRegistrationSerializer(allow_null=True))
    def get_my_registration(self, event):
        ctx = self.context["request"].auth_context
        if not ctx.student_id:
            return None
        registration = next(
            (r for r in event.registrations.all()
             if str(r.student_id) == str(ctx.student_id) and r.cancelled_at is None),
            None,
        )
        if registration is None:
            return None
        return {"id": str(registration.id), "attended": registration.attended,
                "pass_token": getattr(live_pass(registration), "token", None)}


class SoftClashSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    club = serializers.CharField()


class ApprovalSummarySerializer(serializers.Serializer):
    """The approval request opened by a submission, as the proposer sees it."""

    id = serializers.UUIDField()
    stages = serializers.ListField(child=serializers.CharField())
    current_stage = serializers.CharField()
    requires_vc = serializers.BooleanField()
    vc_reason = serializers.CharField()


class EventCreatedSerializer(EventSerializer):
    """Response of POST /events: the event plus what submission found and opened."""

    soft_clashes = SoftClashSerializer(many=True, read_only=True)
    approval = ApprovalSummarySerializer(read_only=True, allow_null=True)

    class Meta(EventSerializer.Meta):
        fields = EventSerializer.Meta.fields + ("soft_clashes", "approval")


class SubmitOutSerializer(ApprovalSummarySerializer):
    """Response of POST /events/{id}/submit."""

    soft_clashes = SoftClashSerializer(many=True)


class EventClashSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    club = serializers.CharField()
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()
    status = serializers.ChoiceField(choices=EventStatus.choices)
    expected_attendance = serializers.IntegerField()


class ClashesSerializer(serializers.Serializer):
    """Response of GET /events/{id}/clashes."""

    clashes = EventClashSerializer(many=True)
    free_venues = VenueSerializer(many=True)


class CalendarBookingSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    title = serializers.CharField()
    club = serializers.CharField()
    venue = serializers.UUIDField()
    venue_name = serializers.CharField()
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()
    status = serializers.ChoiceField(choices=EventStatus.choices)
    confirmed = serializers.BooleanField()
    clash = serializers.BooleanField()


class CalendarClashSerializer(serializers.Serializer):
    venue = serializers.CharField()
    events = EventClashSerializer(many=True)


class VenueCalendarSerializer(serializers.Serializer):
    """Response of GET /venue-calendar."""

    buffer_minutes = serializers.CharField(allow_null=True)
    venues = VenueSerializer(many=True)
    bookings = CalendarBookingSerializer(many=True)
    clashes = CalendarClashSerializer(many=True)


class EventCreateSerializer(serializers.ModelSerializer):
    """
    Proposal intake. Budget arrives either as a template name or explicit lines —
    a proposal with no budget cannot be submitted (governance/services.submit).
    """

    budget_template = serializers.CharField(required=False, allow_blank=True)
    budget_lines = serializers.ListField(child=serializers.DictField(), required=False)
    submit = serializers.BooleanField(default=True)

    class Meta:
        model = Event
        fields = ("title", "club", "kind", "description", "venue", "starts_at", "ends_at",
                  "capacity", "expected_attendance", "fest", "budget_template",
                  "budget_lines", "submit")

    def validate(self, attrs):
        if attrs["ends_at"] <= attrs["starts_at"]:
            raise serializers.ValidationError({"ends_at": "The end time must be after the start time."})
        venue = attrs["venue"]
        if attrs["capacity"] > venue.capacity:
            raise serializers.ValidationError(
                {"capacity": f"{venue.name} seats {venue.capacity}."})
        if attrs["expected_attendance"] > attrs["capacity"]:
            raise serializers.ValidationError(
                {"expected_attendance": "Cannot expect more people than the capacity allows."})
        return attrs


class VenueReassignmentSerializer(serializers.ModelSerializer):
    from_venue_name = serializers.CharField(source="from_venue.name", read_only=True)
    to_venue_name = serializers.CharField(source="to_venue.name", read_only=True)

    class Meta:
        model = VenueReassignment
        fields = ("id", "event", "from_venue", "from_venue_name", "to_venue",
                  "to_venue_name", "reason", "actor_label", "created_at")


class ReassignRequestSerializer(serializers.Serializer):
    to_venue = serializers.UUIDField()
    reason = serializers.CharField(max_length=280)

    def validate_reason(self, value):
        # The club is shown this text, so an empty or one-word reason is not one.
        if len(value.strip()) < 5:
            raise serializers.ValidationError(
                "Give a reason the club can act on — they are shown this text.")
        return value.strip()


def photo_file_url(photo):
    return f"/api/v1/events/{photo.event_id}/photos/{photo.id}/file"


class CloseEventSerializer(serializers.Serializer):
    """Photos and post links are attached beforehand; closing adds the words."""

    outcomes = serializers.CharField(max_length=5000, help_text="What happened, for the report.")
    learnings = serializers.CharField(max_length=5000, required=False, allow_blank=True, default="",
                                      help_text="What worked, what to change next time.")


class EventPhotoSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    removal_requested = serializers.SerializerMethodField()

    class Meta:
        model = EventPhoto
        fields = ("id", "caption", "is_highlight", "content_type", "byte_size", "file_url",
                  "removal_requested", "created_at")
        read_only_fields = fields

    @extend_schema_field(serializers.CharField())
    def get_file_url(self, photo):
        return photo_file_url(photo)

    @extend_schema_field(serializers.BooleanField())
    def get_removal_requested(self, photo):
        return photo.removal_requested_at is not None


class PhotoUploadSerializer(serializers.Serializer):
    file = serializers.FileField(help_text="JPEG, PNG, WebP or HEIC, under 10 MB.")
    caption = serializers.CharField(max_length=300, required=False, allow_blank=True)


class PhotoUpdateSerializer(serializers.Serializer):
    caption = serializers.CharField(max_length=300, required=False, allow_blank=True)
    is_highlight = serializers.BooleanField(required=False)


class EventSocialPostSerializer(serializers.ModelSerializer):
    screenshot_url = serializers.SerializerMethodField()

    class Meta:
        model = EventSocialPost
        fields = ("id", "platform", "url", "screenshot_url", "created_at")
        read_only_fields = fields

    @extend_schema_field(serializers.CharField(allow_null=True))
    def get_screenshot_url(self, post):
        if not post.screenshot_key:
            return None
        return f"/api/v1/events/{post.event_id}/social-posts/{post.id}/screenshot"


class SocialPostInSerializer(serializers.Serializer):
    # URLField accepts http(s) only, so a pasted javascript: link never reaches a page.
    url = serializers.URLField(max_length=500)
    platform = serializers.ChoiceField(choices=EventSocialPost.Platform.choices, required=False,
                                       help_text="Inferred from the link's host when omitted.")
    screenshot = serializers.FileField(required=False, help_text="Optional image of the post.")


class ReportFeedbackSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    average_rating = serializers.FloatField(allow_null=True)


class EventReportDraftSerializer(serializers.Serializer):
    """GET /events/{id}/report — numbers from the records, words from the organiser."""

    registered = serializers.IntegerField()
    attended = serializers.IntegerField()
    attended_students = serializers.IntegerField()
    attended_external = serializers.IntegerField()
    no_show = serializers.IntegerField()
    walk_ins = serializers.IntegerField()
    photos = serializers.IntegerField()
    highlights = serializers.IntegerField()
    social_posts = serializers.IntegerField()
    feedback = ReportFeedbackSerializer()
    budget = BudgetSummarySerializer(allow_null=True)
    social_post_required = serializers.BooleanField(
        help_text="Closing will refuse without a post link at this attendance.")
    outcomes = serializers.CharField(allow_blank=True)
    learnings = serializers.CharField(allow_blank=True)
    submitted_at = serializers.DateTimeField(allow_null=True)


class FestSerializer(serializers.ModelSerializer):
    class Meta:
        model = Fest
        fields = ("id", "name", "club", "starts_on", "ends_on", "status")


class EventOrganiserSerializer(serializers.ModelSerializer):
    prn = serializers.CharField(source="student.prn", read_only=True)
    full_name = serializers.CharField(source="student.full_name", read_only=True)
    assigned_by_label = serializers.CharField(source="assigned_by.display_name", read_only=True,
                                              default=None)

    class Meta:
        model = EventOrganiser
        fields = ("id", "event", "student", "prn", "full_name", "assigned_by_label",
                  "ends_at", "created_at")
        read_only_fields = fields


class OrganiserAssignSerializer(serializers.Serializer):
    student_id = serializers.UUIDField()
    ends_at = serializers.DateTimeField(required=False, allow_null=True)


class OrganisersSerializer(serializers.Serializer):
    """Response of GET /events/{id}/organisers."""

    event = EventRefSerializer()
    results = EventOrganiserSerializer(many=True)
