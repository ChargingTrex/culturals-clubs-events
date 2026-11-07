"""
Server-side permission classes.

AGENT_PROMPT §3.2: hiding a button is not a permission. Every restriction here
must fail at the API when called with a wrong-role token, and tests/ proves it
for each one.

403 vs 404 (API_Standards §3.3): where the existence of the object is itself a
disclosure — another club's budget, another student's record — the queryset
excludes it so the caller gets 404. A 403 would confirm it exists.
"""
from rest_framework.permissions import SAFE_METHODS, BasePermission

from common import roles as R


class HasGlobalRole(BasePermission):
    """Require one of `required_roles`, declared on the view."""

    message = "This endpoint requires a role you do not hold."

    def has_permission(self, request, view):
        required = getattr(view, "required_roles", ())
        if not required:
            return True
        return request.auth_context.has_any(*required)


class IsDean(BasePermission):
    message = "Only the Dean of Student Affairs may do this."

    def has_permission(self, request, view):
        return request.auth_context.has_any(R.DEAN)


class IsViceChancellor(BasePermission):
    message = "Only the Vice-Chancellor may do this."

    def has_permission(self, request, view):
        return request.auth_context.has_any(R.VICE_CHANCELLOR)


class IsApprover(BasePermission):
    """Holds at least one approval stage role."""

    message = "You do not hold an approval role."

    def has_permission(self, request, view):
        return request.auth_context.has_any(*R.STAGE_ROLE.values())


class IsStudent(BasePermission):
    message = "Only a student may do this."

    def has_permission(self, request, view):
        return request.auth_context.has_any(R.STUDENT)


class ReadOnly(BasePermission):
    def has_permission(self, request, view):
        return request.method in SAFE_METHODS


class MFAVerified(BasePermission):
    """
    Identity_Login_Shared_Data §5.5: some operations require an MFA-verified
    session regardless of role — sanctioning above the escalation threshold is
    one of them. Checked from the `mfa` claim, not from the role.
    """

    message = "This action requires a multi-factor-verified session."

    def has_permission(self, request, view):
        return bool(request.auth_context.mfa)
