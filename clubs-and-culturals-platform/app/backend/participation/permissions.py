"""
Who may work a door.

AGENT_PROMPT §6: an organiser sees attendee identities for their own event only.
That is the whole reason this is not simply IsAuthenticated — a check-in
endpoint that any logged-in student may call is a directory of who attended
what, for everybody.
"""
from rest_framework.permissions import BasePermission

from common import roles as R


def event_club_id(event_id):
    """The club that owns an event, or None. One indexed lookup, no join."""
    from events.models import Event

    return Event.objects.filter(pk=event_id).values_list("club_id", flat=True).first()


class IsEventOrganiser(BasePermission):
    """
    Accepts, in order of how the caller most often arrives:

      * a scan-station token bound to this event (Identity §5.3);
      * an `event_organiser:<event_id>` scope for this event;
      * a club role senior enough to run the club's own door;
      * the IT administrator, as a break-glass for a failing station.

    Deliberately NOT the Dean, the Vice-Chancellor or the cultural society: running
    a door is the club's job, and the scan response carries names and PRNs.

    A station token bound to a *different* event is refused outright, whatever
    else the holder is: binding that does not restrict is decoration.
    """

    message = "You are not an organiser of this event."

    def has_permission(self, request, view):
        ctx = getattr(request, "auth_context", None)
        if ctx is None:
            return False

        event_id = str(view.kwargs.get("event_id", ""))

        if ctx.scan_event and str(ctx.scan_event) != event_id:
            return False

        if event_id in {str(e) for e in ctx.organiser_events()}:
            return True

        # NOT can_see_all_clubs(). Event_Flows §10.3 is explicit that the Dean
        # "does not run scan stations, manage rosters, or enter spend — those sit
        # with clubs", and Management does not appear in the flow at all. Only the
        # IT administrator keeps a way in, to debug a station mid-event.
        if ctx.is_admin():
            return True

        club_id = event_club_id(event_id)
        if club_id is None:
            # No such event. Let the view's own lookup produce the 404 rather
            # than answering "not permitted", which would confirm nothing and
            # confuse an organiser who mistyped an id.
            return True

        return ctx.has_club_role(club_id, *R.DOOR_STAFF)
