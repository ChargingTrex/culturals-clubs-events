from django.urls import path
from rest_framework.routers import DefaultRouter

from governance.views import ApprovalViewSet, AuditView, NotificationViewSet

# trailing_slash=False: API_Standards §3.2 writes every path without one
# ("POST /events/{id}/approve"), and a router that appends one turns every
# documented POST into a 301 that silently drops the request body.
router = DefaultRouter(trailing_slash=False)
router.register("approvals", ApprovalViewSet, basename="approval")
router.register("notifications", NotificationViewSet, basename="notification")

urlpatterns = router.urls + [path("audit", AuditView.as_view(), name="audit")]
