"""
Backfill `stage_entered_at` for requests that were already in flight when the
SLA clock arrived (QA wave-1 W3, F11).

0003 gave every existing row `stage_entered_at = migration time`, which would
have restarted every pending request's age at deploy and hidden every escalation
for APPROVAL_SLA_HOURS. The gate a pending request sits at was entered when its
latest step was recorded (the previous gate's approval), or at submission when no
step exists yet; resolved rows take their last step too, so `age_hours` reads
correctly in the history.
"""
from django.db import migrations
from django.db.models import Max


def backfill(apps, schema_editor):
    ApprovalRequest = apps.get_model("governance", "ApprovalRequest")
    latest = (ApprovalRequest.objects
              .annotate(last_step=Max("steps__created_at"))
              .values_list("pk", "created_at", "last_step"))
    for pk, created_at, last_step in latest:
        ApprovalRequest.objects.filter(pk=pk).update(stage_entered_at=last_step or created_at)


class Migration(migrations.Migration):

    dependencies = [
        ("governance", "0003_delegation_approvalrequest_stage_entered_at_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
