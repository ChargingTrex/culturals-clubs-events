from django.apps import AppConfig


class JobsConfig(AppConfig):
    """Scheduled jobs. No models: the app is a set of functions and two front doors."""

    name = "jobs"
    default_auto_field = "django.db.models.BigAutoField"
