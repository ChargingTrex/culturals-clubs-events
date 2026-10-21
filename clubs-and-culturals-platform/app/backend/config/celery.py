import os

from celery import Celery
from celery.schedules import crontab

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
app = Celery("culturals")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()

# The schedule for a real worker (`celery -A config beat`). The Vercel test host
# has no worker and runs the same jobs over HTTP via Vercel Cron instead
# (docs/COMPLETION_PLAN.md §2; jobs/views.py). Times are UTC (settings.TIME_ZONE).
app.conf.beat_schedule = {
    "rollup-scans-nightly": {"task": "jobs.rollup_scans", "schedule": crontab(hour=3, minute=0)},
    "purge-external-nightly": {"task": "jobs.purge_external", "schedule": crontab(hour=3, minute=15)},
    "flag-dormant-nightly": {"task": "jobs.flag_dormant", "schedule": crontab(hour=3, minute=30)},
    "escalate-sla-hourly": {"task": "jobs.escalate_sla", "schedule": crontab(minute=0)},
}
