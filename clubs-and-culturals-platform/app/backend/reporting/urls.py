from django.urls import path

from reporting.views import DeanOverviewView, SemesterReportView

urlpatterns = [
    path("reports/semester", SemesterReportView.as_view(), name="semester-report"),
    path("reports/overview", DeanOverviewView.as_view(), name="dean-overview"),
]
