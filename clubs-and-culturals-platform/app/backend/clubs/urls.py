from rest_framework.routers import DefaultRouter

from clubs.views import ClubViewSet, MembershipViewSet

# trailing_slash=False: API_Standards §3.2 writes every path without one
# ("POST /events/{id}/approve"), and a router that appends one turns every
# documented POST into a 301 that silently drops the request body.
router = DefaultRouter(trailing_slash=False)
router.register("clubs", ClubViewSet, basename="club")
router.register("memberships", MembershipViewSet, basename="membership")

urlpatterns = router.urls
