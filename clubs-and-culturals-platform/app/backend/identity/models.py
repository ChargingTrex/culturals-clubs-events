"""
Local identity. Used in standalone mode only; in platform mode these rows are a
cache of platform-owned data and the platform remains the owner of every field
marked "Platform" in Identity_Login_Shared_Data §3.1.
"""
import re
import uuid

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.core.exceptions import ValidationError
from django.db import models

from common.models import UUIDModel


def validate_prn(value):
    """
    §3.4: the regex lives in shared configuration, not in either codebase.
    Hard-coding it in two places guarantees they drift when the format changes
    for a new intake.
    """
    if not re.match(settings.PRN_REGEX, value or ""):
        raise ValidationError(f"{value!r} is not a valid PRN for this institution.")


class Status(models.TextChoices):
    """§3.5 status lifecycle. `can_login` is derived from it, never stored twice."""

    PROVISIONAL = "provisional", "Admitted, not yet enrolled"
    ACTIVE = "active", "Currently enrolled"
    ON_LEAVE = "on_leave", "Temporarily away, still enrolled"
    GRADUATED = "graduated", "Completed the programme"
    WITHDRAWN = "withdrawn", "Left without completing"
    SUSPENDED = "suspended", "Access revoked, enrolment intact"


LOGIN_ALLOWED = (Status.ACTIVE, Status.ON_LEAVE, Status.GRADUATED)


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra):
        if not email:
            raise ValueError("An institutional email is required.")
        user = self.model(email=self.normalize_email(email), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def with_global_role(self, role):
        """
        Active users holding a global role.

        `global_roles` is a JSON array, and `__contains` on one is PostgreSQL-only
        — which is fine for the target database but would make the module
        unrunnable on anything else, including a quick SQLite demo. So the fast
        path is used where it exists and the filter happens in Python otherwise.

        The Python path is acceptable because global roles are held by staff, who
        number in the single digits next to the student body; it is never used to
        scan for a club role, which is what the scoped role claims are for.
        """
        from django.db import connection

        qs = self.filter(is_active=True)
        if connection.vendor == "postgresql":
            return qs.filter(global_roles__contains=role)
        return [u for u in qs.exclude(global_roles=[]) if role in (u.global_roles or [])]

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("display_name", email.split("@")[0])
        return self.create_user(email, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    """
    §2.1: UUID is the only key. Neither PRN nor email ever appears in a foreign
    key column — email in particular is contact data that happens to be unique
    today, and keying on it inherits a broken record the day it is reassigned.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    personal_email = models.EmailField(blank=True)  # not unique: families share
    display_name = models.CharField(max_length=80)
    # §3.2: one name field. Never split into first/last — a large proportion of
    # students have a single given name or an initial standing for a place name.
    full_name = models.CharField(max_length=160)
    phone = models.CharField(max_length=20, blank=True)  # E.164
    global_roles = models.JSONField(default=list, blank=True)
    mfa_enabled = models.BooleanField(default=False)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["display_name"]

    class Meta:
        db_table = "identity_user"

    def __str__(self):
        return f"{self.display_name} <{self.email}>"

    def save(self, *args, **kwargs):
        if not self.display_name:
            self.display_name = self.full_name or self.email.split("@")[0]
        if not self.full_name:
            self.full_name = self.display_name
        return super().save(*args, **kwargs)

    @property
    def can_login(self):
        return self.is_active and self.status in LOGIN_ALLOWED

    @property
    def student(self):
        return getattr(self, "student_record", None)


class Student(UUIDModel):
    """
    The student record. In standalone mode this is CSV-imported and read-only to
    the application (§2.2); in platform mode it mirrors the platform SIS.

    §3.5: records outlive accounts. A graduated or withdrawn student's
    registrations, attendance and memberships are never deleted — deleting them
    would silently change participation figures for semesters already reported.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="student_record"
    )
    prn = models.CharField(max_length=32, unique=True, validators=[validate_prn])
    full_name = models.CharField(max_length=160)
    department = models.CharField(max_length=16)   # code from the shared list
    programme = models.CharField(max_length=32)    # code from the shared list
    year_of_study = models.PositiveSmallIntegerField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        db_table = "identity_student"
        ordering = ("prn",)
        constraints = [
            models.CheckConstraint(
                condition=models.Q(year_of_study__gte=1, year_of_study__lte=5)
                | models.Q(year_of_study__isnull=True),
                name="student_year_1_to_5",
            )
        ]

    def __str__(self):
        return f"{self.prn} {self.full_name}"

    def save(self, *args, **kwargs):
        # §3.4: stored in canonical upper case, trimmed on input.
        self.prn = (self.prn or "").strip().upper()
        return super().save(*args, **kwargs)


class ReferenceCode(UUIDModel):
    """
    Department and programme codes, owned by the platform SIS (§4).

    Codes are never redefined: if CSE is split, new codes are created. Reusing a
    code with a new meaning makes every historical report retroactively wrong.
    The module stores the code and caches the name for rendering only.
    """

    class Kind(models.TextChoices):
        DEPARTMENT = "department", "Department"
        PROGRAMME = "programme", "Programme"

    kind = models.CharField(max_length=16, choices=Kind.choices)
    code = models.CharField(max_length=32)
    name = models.CharField(max_length=160)
    active = models.BooleanField(default=True)

    class Meta:
        db_table = "identity_reference_code"
        constraints = [models.UniqueConstraint(fields=["kind", "code"], name="unique_code_per_kind")]
        ordering = ("kind", "code")

    def __str__(self):
        return f"{self.kind}:{self.code}"


class Semester(UUIDModel):
    """
    §4: the academic calendar is owned by the platform. The module reads it to
    bound a report and never defines it.
    """

    name = models.CharField(max_length=64, unique=True)
    starts_on = models.DateField()
    ends_on = models.DateField()
    is_current = models.BooleanField(default=False)

    class Meta:
        db_table = "identity_semester"
        ordering = ("-starts_on",)
        constraints = [
            models.CheckConstraint(
                condition=models.Q(ends_on__gt=models.F("starts_on")), name="semester_ends_after_start"
            )
        ]

    def __str__(self):
        return self.name


class RefreshToken(UUIDModel):
    """
    §5.3: refresh tokens are rotated on use, and reuse of a consumed token
    revokes the whole family. Storing the family id is what makes that possible
    — without it, a stolen token can be replayed once undetected.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="refresh_tokens")
    token_hash = models.CharField(max_length=64, unique=True)
    family = models.UUIDField(default=uuid.uuid4)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    mfa = models.BooleanField(default=False)

    class Meta:
        db_table = "identity_refresh_token"
        indexes = [models.Index(fields=["family"]), models.Index(fields=["user", "revoked_at"])]
