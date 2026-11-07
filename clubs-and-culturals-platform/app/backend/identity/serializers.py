"""
Response shapes for the identity routes.

The views build plain dicts (identity/views.py); these serializers are the
documented contract for them, so the generated OpenAPI document — and the
frontend types built from it — say what a caller actually receives. They are
read-only and never parse input, except `RefreshRequestSerializer`, which
documents the one request body the views read by hand.
"""
from rest_framework import serializers

from governance.models import ApprovalStage
from identity.models import Semester


class SsoSerializer(serializers.Serializer):
    enabled = serializers.BooleanField()
    issuer = serializers.CharField(allow_null=True)
    authorize_url = serializers.CharField(allow_null=True)
    audience = serializers.CharField()


class AuthModeSerializer(serializers.Serializer):
    integration_mode = serializers.CharField(help_text="`local` (password login) or `platform` (SSO).")
    sso = SsoSerializer()
    password_login = serializers.BooleanField()
    approval_chain = serializers.ListField(child=serializers.CharField())


class ClaimsSerializer(serializers.Serializer):
    """The access token's claims, minus `typ` and `jti` (Identity §5.1)."""

    sub = serializers.CharField()
    iss = serializers.CharField()
    aud = serializers.CharField()
    email = serializers.EmailField()
    student_id = serializers.UUIDField(allow_null=True)
    prn = serializers.CharField(allow_null=True)
    display_name = serializers.CharField()
    roles = serializers.ListField(child=serializers.CharField())
    department = serializers.CharField(allow_null=True)
    programme = serializers.CharField(allow_null=True)
    year = serializers.IntegerField(allow_null=True)
    mfa = serializers.BooleanField()
    iat = serializers.IntegerField()
    exp = serializers.IntegerField()
    scan_event = serializers.UUIDField(
        required=False, help_text="Present on a scan-station session only: the bound event.")


class SessionSerializer(serializers.Serializer):
    access_token = serializers.CharField()
    refresh_token = serializers.CharField()
    token_type = serializers.CharField(help_text="Always `Bearer`.")
    expires_in = serializers.IntegerField(help_text="Seconds until the access token expires.")
    claims = ClaimsSerializer()


class RefreshRequestSerializer(serializers.Serializer):
    refresh_token = serializers.CharField()


class CapabilitiesSerializer(serializers.Serializer):
    """Advisory rendering hints; every one is re-checked server-side on use."""

    can_see_individual_records = serializers.BooleanField()
    can_see_all_clubs = serializers.BooleanField()
    is_student = serializers.BooleanField()
    is_dean = serializers.BooleanField()
    is_vice_chancellor = serializers.BooleanField()
    is_cultural_society = serializers.BooleanField()
    is_admin = serializers.BooleanField()
    clubs = serializers.ListField(child=serializers.UUIDField())
    clubs_with_budget_access = serializers.ListField(child=serializers.UUIDField())
    clubs_can_assign_roles = serializers.ListField(child=serializers.UUIDField())
    clubs_can_propose = serializers.ListField(child=serializers.UUIDField())
    clubs_can_operate_events = serializers.ListField(child=serializers.UUIDField())
    clubs_can_enter_spend = serializers.ListField(child=serializers.UUIDField())
    clubs_door_staff = serializers.ListField(child=serializers.UUIDField())
    can_see_overview = serializers.BooleanField()
    organiser_events = serializers.ListField(child=serializers.UUIDField())
    approval_stages = serializers.ListField(
        child=serializers.ChoiceField(choices=ApprovalStage.choices))
    my_clubs_count = serializers.IntegerField(
        help_text="Active memberships held now (counted, not read from the token).")
    max_club_memberships = serializers.IntegerField()


class PreferencesSerializer(serializers.Serializer):
    """`GET /module/auth/preferences`, and `preferences` on `/module/auth/me`."""

    personalised_feed = serializers.BooleanField()


class PreferencesPatchSerializer(serializers.Serializer):
    """A partial update; a key not listed here is refused (422)."""

    personalised_feed = serializers.BooleanField(required=False)

    def validate(self, attrs):
        unknown = sorted(set(self.initial_data) - set(self.fields))
        if unknown:
            raise serializers.ValidationError(
                {key: "Not a preference this module knows." for key in unknown})
        return attrs


class MeSerializer(serializers.Serializer):
    sub = serializers.CharField()
    display_name = serializers.CharField()
    prn = serializers.CharField(allow_null=True)
    student_id = serializers.UUIDField(allow_null=True)
    department = serializers.CharField(allow_null=True)
    programme = serializers.CharField(allow_null=True)
    year = serializers.IntegerField(allow_null=True)
    roles = serializers.ListField(child=serializers.CharField())
    mfa = serializers.BooleanField()
    capabilities = CapabilitiesSerializer()
    preferences = PreferencesSerializer()


class SemesterSerializer(serializers.ModelSerializer):
    class Meta:
        model = Semester
        fields = ("id", "name", "starts_on", "ends_on", "is_current")
        read_only_fields = fields


class DirectoryStudentSerializer(serializers.Serializer):
    student_id = serializers.UUIDField()
    prn = serializers.CharField()
    full_name = serializers.CharField()
    department = serializers.CharField()
    programme = serializers.CharField()
    year = serializers.IntegerField()


class DirectoryResultsSerializer(serializers.Serializer):
    results = DirectoryStudentSerializer(many=True)


class DemoPersonaSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    sub = serializers.CharField()
    available = serializers.BooleanField()
    name = serializers.CharField(allow_null=True)
    # Demo mode only: the public pilot account, so the sign-in page can fill the form.
    email = serializers.EmailField(allow_null=True)
    password = serializers.CharField(allow_null=True)
    mfa_required = serializers.BooleanField()


class DemoPersonasSerializer(serializers.Serializer):
    demo_mode = serializers.BooleanField()
    personas = DemoPersonaSerializer(many=True)


class DemoPersonaRefSerializer(serializers.Serializer):
    key = serializers.CharField()
    label = serializers.CharField()
    sub = serializers.CharField()


class DemoSessionSerializer(SessionSerializer):
    persona = DemoPersonaRefSerializer()
