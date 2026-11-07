from django.urls import path

from jobs.views import JobTriggerView

urlpatterns = [
    # Mounted at /api/v1/jobs/ by config/urls.py. Names are hyphenated (slug).
    path("<slug:name>", JobTriggerView.as_view(), name="jobs-run"),
]
