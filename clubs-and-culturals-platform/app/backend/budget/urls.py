from django.urls import path
from rest_framework.routers import DefaultRouter

from budget.views import BudgetTemplateView, BudgetViewSet, EnvelopeView

# trailing_slash=False: API_Standards §3.2 writes every path without one
# ("POST /events/{id}/approve"), and a router that appends one turns every
# documented POST into a 301 that silently drops the request body.
router = DefaultRouter(trailing_slash=False)
router.register("budgets", BudgetViewSet, basename="budget")

urlpatterns = router.urls + [
    path("budget-templates", BudgetTemplateView.as_view(), name="budget-templates"),
    path("envelopes/<uuid:club_id>", EnvelopeView.as_view(), name="budget-envelope"),
]
