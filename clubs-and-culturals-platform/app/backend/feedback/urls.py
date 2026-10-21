from django.urls import path

from feedback.views import EventFeedbackView, FeedbackSummaryView

urlpatterns = [
    path("events/<uuid:event_id>", EventFeedbackView.as_view(), name="feedback-submit"),
    path("events/<uuid:event_id>/summary", FeedbackSummaryView.as_view(),
         name="feedback-summary"),
]
