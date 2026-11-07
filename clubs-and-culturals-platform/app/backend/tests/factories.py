"""
Test fixtures.

Deliberately builds through the real services where a service exists, so a test
that passes proves the production path works rather than a shortcut around it.
"""
from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from budget.models import Budget, BudgetLine
from clubs.models import Club, Membership
from common import roles as R
from events.models import Event, EventPhoto, EventSocialPost, EventStatus, Venue
from identity.models import Semester, Student, User

PASSWORD = "test-password-123"


def user(email, *, name=None, global_roles=(), mfa=False):
    return User.objects.create_user(
        email=email, password=PASSWORD, full_name=name or email.split("@")[0],
        display_name=name or email.split("@")[0], global_roles=list(global_roles),
        mfa_enabled=mfa,
    )


def student(email, *, prn, name=None, dept="CSE", programme="BTech-CSE", year=2):
    u = user(email, name=name, global_roles=[R.STUDENT])
    return Student.objects.create(user=u, prn=prn, full_name=name or u.full_name,
                                  department=dept, programme=programme, year_of_study=year)


def club(name="Swara", *, category=Club.Category.CULTURAL):
    return Club.objects.create(name=name, slug=name.lower(), tag="Music", category=category)


def member(club_obj, student_obj, role=R.CLUB_MEMBER):
    return Membership.objects.create(club=club_obj, student=student_obj, role=role)


def venue(name="Amphitheatre", capacity=300):
    return Venue.objects.create(name=name, capacity=capacity)


def semester():
    today = timezone.localdate()
    return Semester.objects.create(name="Test Semester", starts_on=today - timedelta(days=60),
                                   ends_on=today + timedelta(days=60), is_current=True)


def slot(days=7, hour=18):
    """An hour-aligned start on the campus clock (C-02), `days` from today."""
    from zoneinfo import ZoneInfo

    from django.conf import settings

    local = timezone.now().astimezone(ZoneInfo(settings.DISPLAY_TIME_ZONE))
    return local.replace(hour=hour, minute=0, second=0, microsecond=0) + timedelta(days=days)


def event(club_obj, venue_obj, *, title="Test Event", days=7, hour=18, duration=2,
          status=EventStatus.DRAFT, expected=100, capacity=None, fest=None, starts=None):
    if starts is None:
        starts = timezone.now().replace(hour=hour, minute=0, second=0, microsecond=0) + timedelta(days=days)
    return Event.objects.create(
        title=title, club=club_obj, venue=venue_obj, starts_at=starts,
        ends_at=starts + timedelta(hours=duration), capacity=capacity or venue_obj.capacity,
        expected_attendance=expected, status=status, fest=fest,
    )


def evidence(event_obj, *, photos=0, links=(), highlight=False):
    """
    Photo and post-link rows without files, for tests that only read the
    records (reporting). Upload itself is tested through the API.
    """
    for i in range(photos):
        EventPhoto.objects.create(event=event_obj, file_key=f"test/{event_obj.pk}-{i}.jpg",
                                  file_name=f"{i}.jpg", content_type="image/jpeg",
                                  is_highlight=highlight and i == 0)
    for url in links:
        EventSocialPost.objects.create(event=event_obj, url=url,
                                       platform=EventSocialPost.Platform.INSTAGRAM
                                       if "instagram" in url else EventSocialPost.Platform.OTHER)


def budget(event_obj, amounts=(10000,)):
    b = Budget.objects.create(event=event_obj)
    for position, amount in enumerate(amounts):
        BudgetLine.objects.create(budget=b, head=f"Head {position + 1}",
                                  amount_requested=Decimal(amount), position=position)
    return b


def token_for(client, email, *, mfa_code=""):
    """Log in over the API, so the token under test is one the API really issues."""
    response = client.post("/api/v1/module/auth/login",
                           {"email": email, "password": PASSWORD, "mfa_code": mfa_code},
                           format="json")
    assert response.status_code == 200, (email, response.status_code, response.data)
    return response.data["access_token"]


def as_user(client, email, *, mfa_code=""):
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token_for(client, email, mfa_code=mfa_code)}")
    return client


def ctx_for(user_obj, *, mfa=True):
    """
    An AuthContext as the authentication layer would build it, for testing a
    service directly. Roles come from roles_for(), so a test cannot accidentally
    grant itself a role the token would not carry.
    """
    from identity.authentication import AuthContext
    from identity.tokens import roles_for
    from integrations.base import Claims

    student_obj = user_obj.student
    return AuthContext(Claims(
        sub=str(user_obj.id), email=user_obj.email, display_name=user_obj.display_name,
        student_id=str(student_obj.id) if student_obj else None,
        prn=student_obj.prn if student_obj else None,
        roles=tuple(roles_for(user_obj)), mfa=mfa,
    ))
