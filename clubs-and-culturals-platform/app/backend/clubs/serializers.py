from rest_framework import serializers

from clubs.models import Club, JoinRequest, Membership, OfficeBearerTerm, RoleChange
from clubs.services import OFFICE_BEARER_ROLES


class ClubSerializer(serializers.ModelSerializer):
    member_count = serializers.SerializerMethodField()
    my_role = serializers.SerializerMethodField()

    class Meta:
        model = Club
        fields = ("id", "name", "slug", "tag", "category", "description",
                  "instagram_handle", "status", "join_mode", "last_activity_at",
                  "member_count", "my_role")
        read_only_fields = ("id", "slug", "last_activity_at")

    def get_member_count(self, club):
        return club.memberships.filter(ended_at__isnull=True).count()

    def get_my_role(self, club):
        ctx = self.context["request"].auth_context
        return ctx.club_role(club.id)


class MembershipSerializer(serializers.ModelSerializer):
    prn = serializers.CharField(source="student.prn", read_only=True)
    full_name = serializers.CharField(source="student.full_name", read_only=True)
    department = serializers.CharField(source="student.department", read_only=True)
    programme = serializers.CharField(source="student.programme", read_only=True)
    year = serializers.IntegerField(source="student.year_of_study", read_only=True)
    role_label = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = Membership
        fields = ("id", "club", "student", "prn", "full_name", "department", "programme",
                  "year", "role", "role_label", "joined_at", "ended_at")
        read_only_fields = ("id", "joined_at")


class RoleChangeRequestSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=[c[0] for c in Membership.ROLE_CHOICES])
    reason = serializers.CharField(required=False, allow_blank=True, max_length=280)


class RoleChangeSerializer(serializers.ModelSerializer):
    class Meta:
        model = RoleChange
        fields = ("id", "membership", "actor_label", "from_role", "to_role", "reason",
                  "created_at")


class JoinRequestSerializer(serializers.ModelSerializer):
    prn = serializers.CharField(source="student.prn", read_only=True)
    full_name = serializers.CharField(source="student.full_name", read_only=True)
    department = serializers.CharField(source="student.department", read_only=True)
    programme = serializers.CharField(source="student.programme", read_only=True)
    year = serializers.IntegerField(source="student.year_of_study", read_only=True)
    decided_by_label = serializers.CharField(source="decided_by.display_name", read_only=True,
                                             default=None)

    class Meta:
        model = JoinRequest
        fields = ("id", "club", "student", "prn", "full_name", "department", "programme",
                  "year", "state", "note", "decided_by_label", "decided_at", "created_at")
        read_only_fields = fields


class JoinDecisionSerializer(serializers.Serializer):
    note = serializers.CharField(required=False, allow_blank=True, max_length=280)


class HandoverAssignmentSerializer(serializers.Serializer):
    student_id = serializers.UUIDField()
    role = serializers.ChoiceField(choices=list(OFFICE_BEARER_ROLES))


class HandoverRequestSerializer(serializers.Serializer):
    effective_at = serializers.DateTimeField()
    assignments = HandoverAssignmentSerializer(many=True)


class OfficeBearerTermSerializer(serializers.ModelSerializer):
    prn = serializers.CharField(source="student.prn", read_only=True)
    full_name = serializers.CharField(source="student.full_name", read_only=True)
    role_label = serializers.CharField(source="get_role_display", read_only=True)
    created_by_label = serializers.CharField(source="created_by.display_name", read_only=True,
                                             default=None)

    class Meta:
        model = OfficeBearerTerm
        fields = ("id", "club", "student", "prn", "full_name", "role", "role_label",
                  "starts_at", "ends_at", "created_by_label", "created_at")
        read_only_fields = fields
