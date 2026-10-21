from django.urls import path
from rest_framework.routers import DefaultRouter

from events.views import EventViewSet, VenueCalendarView, VenueViewSet

# trailing_slash=False: API_Standards §3.2 writes every path without one
# ("POST /events/{id}/approve"), and a router that appends one turns every
# documented POST into a 301 that silently drops the request body.
router = DefaultRouter(trailing_slash=False)
router.register("events", EventViewSet, basename="event")
router.register("venues", VenueViewSet, basename="venue")

urlpatterns = router.urls + [
    path("venue-calendar", VenueCalendarView.as_view(), name="venue-calendar"),
]
