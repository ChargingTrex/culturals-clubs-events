"""
Paths follow qr-attendance-kit/README.md, plus the student-side routes the kit
assumes exist without providing — without them no pass is ever minted.

`/verify/{token}` from the kit's table is deliberately absent: the certificates
portal it belongs to is not implemented here. Only the token purpose exists
(qrkit.tokens.PURPOSE_CERTIFICATE), so adding the portal later needs no change to
the signing format.
"""
from django.urls import path
from rest_framework.routers import DefaultRouter

from participation import views

# trailing_slash=False: API_Standards §3.2 writes every path without one
# ("POST /events/{id}/approve"), and a router that appends one turns every
# documented POST into a 301 that silently drops the request body.
router = DefaultRouter(trailing_slash=False)
router.register("registrations", views.RegistrationViewSet, basename="registration")

urlpatterns = router.urls + [
    path("me/qr", views.MyPassesView.as_view(), name="participation-profile-qr"),
    path("my-passes", views.MyPassesView.as_view(), name="my-passes"),
    path("events/<uuid:event_id>/scan", views.ScanStationView.as_view(),
         name="participation-scan"),
    path("events/<uuid:event_id>/scan/sync", views.OfflineSyncView.as_view(),
         name="participation-scan-sync"),
    path("events/<uuid:event_id>/check-in", views.ManualCheckInView.as_view(),
         name="participation-check-in"),
    path("events/<uuid:event_id>/roster", views.EventRosterView.as_view(),
         name="participation-roster"),
    path("events/<uuid:event_id>/scan-session", views.ScanSessionView.as_view(),
         name="participation-scan-session"),
]
