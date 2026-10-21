from django.urls import path

from reporting.views import DeanOverviewView, SemesterReportView

urlpatterns = [
    path("reports/semester", SemesterReportView.as_view(), name="semester-report"),
    # Same view, CSV renderer pre-selected (DRF reads the `format` kwarg). Equivalent
    # to `reports/semester?format=csv`; the path form is what a cron or a browser
    # bookmark wants.
    path("reports/semester/csv", SemesterReportView.as_view(), {"format": "csv"},
         name="semester-report-csv"),
    path("reports/overview", DeanOverviewView.as_view(), name="dean-overview"),
]
