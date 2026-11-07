"""
Event evidence routes (PRD §5.10, §5.14, §5.12.3): photos, social post links
and the auto-drafted report. Mixed into EventViewSet so every route resolves
the event through its scoped queryset — an event the caller cannot see is a
404 here as everywhere else.
"""
from django.http import FileResponse, HttpResponseRedirect
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from common import roles as R
from common.errors import ProblemDetail
from events import services
from events.serializers import (
    EventPhotoSerializer, EventReportDraftSerializer, EventSerializer, EventSocialPostSerializer,
    PhotoUpdateSerializer, PhotoUploadSerializer, SocialPostInSerializer,
)
from integrations.files import file_location
from integrations.registry import audit_sink

UUID_RE = r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
_PHOTO_ID = OpenApiParameter("photo_id", OpenApiTypes.UUID, OpenApiParameter.PATH)
_POST_ID = OpenApiParameter("post_id", OpenApiTypes.UUID, OpenApiParameter.PATH)


def operates(ctx, event):
    """Who may run an event and record its evidence: the same people who may close it."""
    return (ctx.has_club_role(event.club_id, *R.EVENT_OPERATORS)
            or str(event.id) in ctx.organiser_events()
            or ctx.is_dean())


def _require_operator(ctx, event):
    if not operates(ctx, event):
        raise ProblemDetail(code="EVENTS_EVIDENCE_DENIED", title="Not permitted",
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Only the organiser or the club's office bearers may do this.")


def _not_found(what):
    return ProblemDetail(code="NOT_FOUND", title="Not found", status_code=404,
                         detail=f"No such {what} on this event.")


def _serve(key, content_type, name):
    """Stream from the local bucket or redirect to the store, as receipts are served."""
    location = file_location(key)
    if location is None or (location["kind"] == "file" and not location["path"].is_file()):
        raise ProblemDetail(code="EVENTS_FILE_MISSING", title="File not found", status_code=404,
                            detail="The file is no longer in the store.")
    if location["kind"] == "redirect":
        response = HttpResponseRedirect(location["url"])
    else:
        inline = content_type in services.PHOTO_CONTENT_TYPES
        path = location["path"]
        response = FileResponse(open(path, "rb"),
                                content_type=content_type if inline else "application/octet-stream",
                                filename=name, as_attachment=not inline)
        response["Content-Length"] = path.stat().st_size
        response["X-Content-Type-Options"] = "nosniff"
        response["Content-Security-Policy"] = "sandbox"
    response["Cache-Control"] = "private, no-store"
    return response


class EventEvidenceMixin:
    def _live_photo(self, event, photo_id):
        photo = event.photos.filter(pk=photo_id, removed_at__isnull=True).first()
        if photo is None:
            raise _not_found("photo")
        return photo

    # ---- photos --------------------------------------------------------
    @extend_schema(methods=["GET"], request=None, responses=EventPhotoSerializer(many=True),
                   summary="The event's photo gallery")
    @extend_schema(methods=["POST"], request={"multipart/form-data": PhotoUploadSerializer},
                   responses={201: EventPhotoSerializer}, summary="Upload a photo to the event")
    @action(detail=True, methods=["get", "post"], url_path="photos")
    def photos(self, request, pk=None):
        event = self.get_object()
        if request.method == "GET":
            live = event.photos.filter(removed_at__isnull=True)
            return Response(EventPhotoSerializer(live, many=True).data)
        ctx = request.auth_context
        _require_operator(ctx, event)
        photo = services.add_photo(event, request.FILES.get("file"),
                                   caption=request.data.get("caption", ""), actor_sub=ctx.sub or None)
        return Response(EventPhotoSerializer(photo).data, status=status.HTTP_201_CREATED)

    @extend_schema(methods=["PATCH"], request=PhotoUpdateSerializer, responses=EventPhotoSerializer,
                   parameters=[_PHOTO_ID], summary="Caption a photo or mark it as a highlight")
    @extend_schema(methods=["DELETE"], request=None, responses={204: None}, parameters=[_PHOTO_ID],
                   summary="Take a photo down")
    @action(detail=True, methods=["patch", "delete"], url_path=rf"photos/(?P<photo_id>{UUID_RE})")
    def photo(self, request, pk=None, photo_id=None):
        event = self.get_object()
        ctx = request.auth_context
        _require_operator(ctx, event)
        photo = self._live_photo(event, photo_id)
        if request.method == "DELETE":
            photo.removed_at = timezone.now()
            photo.save(update_fields=["removed_at", "updated_at"])
            audit_sink().record(actor=ctx, action="event.photo_removed", target=event,
                                after={"photo": str(photo.id),
                                       "removal_requested": photo.removal_requested_at is not None})
            return Response(status=status.HTTP_204_NO_CONTENT)
        data = PhotoUpdateSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        for field, value in data.validated_data.items():
            setattr(photo, field, value.strip() if field == "caption" else value)
        photo.save(update_fields=[*data.validated_data, "updated_at"])
        return Response(EventPhotoSerializer(photo).data)

    @extend_schema(responses={(200, "image/*"): OpenApiTypes.BINARY, 302: None},
                   parameters=[_PHOTO_ID], summary="The photo file")
    @action(detail=True, methods=["get"], url_path=rf"photos/(?P<photo_id>{UUID_RE})/file")
    def photo_file(self, request, pk=None, photo_id=None):
        photo = self._live_photo(self.get_object(), photo_id)
        return _serve(photo.file_key, photo.content_type, photo.file_name)

    @extend_schema(request=None, responses=EventPhotoSerializer, parameters=[_PHOTO_ID],
                   summary="Ask for a photo you appear in to be removed")
    @action(detail=True, methods=["post"],
            url_path=rf"photos/(?P<photo_id>{UUID_RE})/removal-request")
    def photo_removal_request(self, request, pk=None, photo_id=None):
        photo = self._live_photo(self.get_object(), photo_id)
        services.request_photo_removal(photo, actor_sub=request.auth_context.sub or None)
        return Response(EventPhotoSerializer(photo).data)

    # ---- social post links --------------------------------------------
    @extend_schema(methods=["GET"], request=None, responses=EventSocialPostSerializer(many=True),
                   summary="Links to posts promoting the event")
    @extend_schema(methods=["POST"],
                   request={"application/json": SocialPostInSerializer,
                            "multipart/form-data": SocialPostInSerializer},
                   responses={201: EventSocialPostSerializer},
                   summary="Record a link to a post (stored, never fetched)")
    @action(detail=True, methods=["get", "post"], url_path="social-posts")
    def social_posts(self, request, pk=None):
        event = self.get_object()
        if request.method == "GET":
            return Response(EventSocialPostSerializer(event.social_posts.all(), many=True).data)
        ctx = request.auth_context
        _require_operator(ctx, event)
        data = SocialPostInSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        post = services.add_social_post(
            event, url=data.validated_data["url"], platform=data.validated_data.get("platform"),
            screenshot=request.FILES.get("screenshot"), actor_sub=ctx.sub or None)
        return Response(EventSocialPostSerializer(post).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=None, responses={204: None}, parameters=[_POST_ID],
                   summary="Remove a wrongly recorded link")
    @action(detail=True, methods=["delete"], url_path=rf"social-posts/(?P<post_id>{UUID_RE})")
    def social_post(self, request, pk=None, post_id=None):
        event = self.get_object()
        _require_operator(request.auth_context, event)
        # A wrong link is not evidence of anything, so it goes outright.
        deleted, _ = event.social_posts.filter(pk=post_id).delete()
        if not deleted:
            raise _not_found("post")
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(responses={(200, "image/*"): OpenApiTypes.BINARY, 302: None},
                   parameters=[_POST_ID], summary="The screenshot kept with a post link")
    @action(detail=True, methods=["get"],
            url_path=rf"social-posts/(?P<post_id>{UUID_RE})/screenshot")
    def social_post_screenshot(self, request, pk=None, post_id=None):
        post = self.get_object().social_posts.filter(pk=post_id).exclude(screenshot_key="").first()
        if post is None:
            raise _not_found("screenshot")
        return _serve(post.screenshot_key, post.screenshot_content_type, f"post-{post.id}")

    # ---- the report ---------------------------------------------------
    @extend_schema(request=None, responses=EventReportDraftSerializer,
                   summary="The event report, auto-drafted from the records")
    @action(detail=True, methods=["get"], url_path="report")
    def report(self, request, pk=None):
        event = self.get_object()
        ctx = request.auth_context
        if not (operates(ctx, event) or ctx.can_see_all_clubs()):
            raise ProblemDetail(code="EVENTS_REPORT_DENIED", title="Not permitted",
                                status_code=status.HTTP_403_FORBIDDEN,
                                detail="The event report is for its organisers and staff.")
        draft = services.report_draft(event)
        # Money only for the roles that may see it (AGENT_PROMPT §6).
        draft["budget"] = EventSerializer(context={"request": request}).get_budget(event)
        return Response(draft)
