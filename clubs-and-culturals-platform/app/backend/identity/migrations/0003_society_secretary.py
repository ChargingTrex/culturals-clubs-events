"""
AR-08: the Cultural Society's approval stage moves from every `cultural_society`
holder to its Secretary and Vice-Secretary. So that proposals already waiting on
the Society are not stranded, a database with no Secretary yet gets one: the
longest-standing active Society member. Everyone else stays a member; the Dean
appoints the Vice-Secretary from the Society page.
"""
from django.db import migrations

MEMBER, SECRETARY = "cultural_society", "cultural_society_secretary"


def appoint_first_secretary(apps, schema_editor):
    User = apps.get_model("identity", "User")
    holders = [u for u in User.objects.filter(is_active=True).order_by("created_at")
               if MEMBER in (u.global_roles or []) or SECRETARY in (u.global_roles or [])]
    if not holders or any(SECRETARY in u.global_roles for u in holders):
        return
    first = holders[0]
    first.global_roles = [r for r in first.global_roles if r != MEMBER] + [SECRETARY]
    first.save(update_fields=["global_roles"])


def back_to_member(apps, schema_editor):
    User = apps.get_model("identity", "User")
    officers = (SECRETARY, "cultural_society_vice_secretary")
    for user in User.objects.all():
        roles = user.global_roles or []
        if any(r in officers for r in roles):
            user.global_roles = [r for r in roles if r not in officers + (MEMBER,)] + [MEMBER]
            user.save(update_fields=["global_roles"])


class Migration(migrations.Migration):
    dependencies = [("identity", "0002_user_preferences")]
    operations = [migrations.RunPython(appoint_first_secretary, back_to_member)]
