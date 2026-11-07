"""
Celery entry points for the scheduled jobs.

Thin on purpose: each task calls `jobs.services.run_job`, the same function the
HTTP trigger calls, so a job behaves identically under a worker, under
CELERY_TASK_ALWAYS_EAGER and under Vercel Cron. The schedule lives in
config/celery.py (`beat_schedule`).
"""
from celery import shared_task

from jobs.services import run_job


@shared_task(name="jobs.rollup_scans")
def rollup_scans():
    return run_job("rollup-scans")


@shared_task(name="jobs.purge_external")
def purge_external():
    return run_job("purge-external")


@shared_task(name="jobs.flag_dormant")
def flag_dormant():
    return run_job("flag-dormant")


@shared_task(name="jobs.escalate_sla")
def escalate_sla():
    return run_job("escalate-sla")


@shared_task(name="jobs.apply_due_terms")
def apply_due_terms():
    return run_job("apply-due-terms")


@shared_task(name="jobs.complete_ended")
def complete_ended():
    return run_job("complete-ended")
