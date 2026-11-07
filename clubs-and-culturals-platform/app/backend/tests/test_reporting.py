"""
Semester report aggregation.

AGENT_PROMPT §5 is explicit about this one: "Verify this against a seeded dataset
with known overlap — do not assume the query is right because it runs." So the
overlap here is constructed by hand and the expected numbers are written down.
"""
from django.test import TestCase
from rest_framework.test import APIClient

from common import roles as R
from events.models import EventStatus
from participation import services
from tests import factories as f


class UniqueVersusTotalTests(TestCase):
    """
    Three events. Six students. Attendance deliberately overlapping:

        event A: s1 s2 s3 s4        (4)
        event B: s1 s2 s5           (3)
        event C: s1 s6              (2)

    total_participation = 9, unique_students = 6. A query that confuses the two
    reports 9 as reach, which is the exact mistake this whole figure exists to
    prevent: 20 events attended by the same 80 students and 20 events reaching 600
    both give the same total.
    """

    def setUp(self):
        self.semester = f.semester()
        self.club = f.club("Swara")
        self.organiser = f.student("org@college.edu", prn="23CS1000")
        f.member(self.club, self.organiser, R.CLUB_PRESIDENT)
        self.students = [
            f.student(f"s{i}@college.edu", prn=f"23CS100{i}", dept="CSE" if i < 4 else "ECE")
            for i in range(1, 7)
        ]
        plan = [("A", [0, 1, 2, 3]), ("B", [0, 1, 4]), ("C", [0, 5])]
        for index, (title, indices) in enumerate(plan):
            event = f.event(self.club, f.venue(f"Venue {title}", 300), title=title,
                            days=-10 + index, status=EventStatus.PUBLISHED)
            for i in indices:
                reg = services.register_student(event, self.students[i])
                services.resolve(services.live_pass(reg).token, event,
                                 operator=self.organiser.user, station_id="G1")
            event.status = EventStatus.REPORTED
            event.save()
            f.evidence(event, photos=3, links=["https://example.com/p/1"])

    def test_total_and_unique_are_different_numbers(self):
        from reporting.services import semester_report

        report = semester_report(self.semester)
        self.assertEqual(report["events_run"], 3)
        self.assertEqual(report["total_participation"], 9)
        self.assertEqual(report["unique_students"], 6)
        self.assertEqual(report["avg_attendance"], 3)

    def test_department_split_uses_the_snapshot_not_the_current_record(self):
        """
        A student who changes department must not retroactively move their past
        attendance, or a report already issued would give different numbers when
        re-run.
        """
        from reporting.services import semester_report

        before = semester_report(self.semester)["by_department"]
        moved = self.students[0]
        moved.department = "LAW"
        moved.save()
        after = semester_report(self.semester)["by_department"]
        self.assertEqual(before, after)

    def test_registered_but_absent_is_not_counted_as_participation(self):
        """Rule 6: count `attended`, never `registered`."""
        from reporting.services import semester_report

        event = f.event(self.club, f.venue("Extra", 100), title="D", days=-2,
                        status=EventStatus.PUBLISHED)
        for student in self.students:
            services.register_student(event, student)   # nobody checks in
        event.status = EventStatus.REPORTED
        event.save()
        report = semester_report(self.semester)
        self.assertEqual(report["total_participation"], 9, "absentees must not count")
        self.assertEqual(report["events_run"], 4)

    def test_external_participants_are_counted_separately_never_summed(self):
        """Rule 7."""
        from participation.models import ExternalParticipant, Registration
        from reporting.services import semester_report

        event = f.event(self.club, f.venue("Fest Hall", 500), title="Fest", days=-1,
                        status=EventStatus.PUBLISHED)
        guest = ExternalParticipant.objects.create(full_name="Outside Guest",
                                                   institution="Another College")
        Registration.objects.create(event=event, external=guest, attended=True,
                                    checked_in_at=event.starts_at)
        event.status = EventStatus.REPORTED
        event.save()
        report = semester_report(self.semester)
        self.assertEqual(report["unique_students"], 6, "a guest is not a student reached")
        self.assertEqual(report["external_participants"], 1)


class ReportAccessTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        f.semester()
        f.user("dean@college.edu", global_roles=[R.DEAN], mfa=True)
        f.user("vc@college.edu", global_roles=[R.VICE_CHANCELLOR], mfa=True)
        f.student("student@college.edu", prn="23CS1001")

    def test_the_dean_and_the_vc_can_read_the_report(self):
        for email in ("dean@college.edu", "vc@college.edu"):
            f.as_user(self.client, email, mfa_code="1")
            self.assertEqual(
                self.client.get("/api/v1/reporting/reports/semester").status_code, 200, email)

    def test_a_student_cannot(self):
        f.as_user(self.client, "student@college.edu")
        response = self.client.get("/api/v1/reporting/reports/semester")
        self.assertEqual(response.status_code, 403)

    def test_the_report_carries_no_individual_records(self):
        """AGENT_PROMPT §6: the Vice-Chancellor gets no individual records."""
        f.as_user(self.client, "vc@college.edu", mfa_code="1")
        body = self.client.get("/api/v1/reporting/reports/semester").content.decode()
        self.assertNotIn("prn", body.lower())

    def test_the_report_states_its_own_caveats(self):
        f.as_user(self.client, "dean@college.edu", mfa_code="1")
        report = self.client.get("/api/v1/reporting/reports/semester").data
        self.assertTrue(report["caveats"])


class VCDashboardOnlyTests(TestCase):
    """
    The Vice-Chancellor gets a dashboard, never a roster.

    Three documents say so: AGENT_PROMPT §6 ("No individual records"),
    Database_And_Data_Flow §6.2, and Event_Flows §14.2 ("aggregate figures only").
    The semester report was already clean; these are the endpoints that leaked
    names and PRNs because one predicate answered two different questions.
    """

    def setUp(self):
        self.client = APIClient()
        f.semester()
        self.club = f.club("Swara")
        self.president = f.student("pres@college.edu", prn="23CS1001", name="Arjun P")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        self.attendee = f.student("att@college.edu", prn="23CS1002", name="Meera A")
        self.event = f.event(self.club, f.venue(), days=0, status=EventStatus.LIVE)
        self.registration = services.register_student(self.event, self.attendee)

        f.user("vc@college.edu", name="VC", global_roles=[R.VICE_CHANCELLOR], mfa=True)
        f.user("dean@college.edu", name="Dean", global_roles=[R.DEAN], mfa=True)
        f.user("society@college.edu", name="Society",
               global_roles=[R.CULTURAL_SOCIETY], mfa=True)

    def as_vc(self):
        return f.as_user(self.client, "vc@college.edu", mfa_code="1")

    # ---- what the VC must NOT reach ------------------------------------
    def test_vc_cannot_read_a_club_roster(self):
        self.as_vc()
        response = self.client.get(f"/api/v1/clubs/{self.club.id}/members")
        self.assertEqual(response.status_code, 404)

    def test_vc_cannot_read_an_attendee_list(self):
        self.as_vc()
        response = self.client.get(
            f"/api/v1/participation/events/{self.event.id}/roster")
        self.assertEqual(response.status_code, 404)

    def test_vc_cannot_look_a_student_up_by_prn(self):
        self.as_vc()
        response = self.client.get("/api/v1/module/directory/students?q=23CS1002")
        self.assertEqual(response.status_code, 403)

    def test_the_membership_queryset_is_empty_for_the_vc(self):
        """
        There is no membership *listing* endpoint, so this pins the queryset that
        the role-assignment action scopes itself with — if a listing is ever added,
        it must not hand Management the roster by default.
        """
        from clubs.views import MembershipViewSet

        view = MembershipViewSet()
        view.request = type("R", (), {
            "auth_context": f.ctx_for(f.User.objects.get(email="vc@college.edu")),
            "query_params": {},
        })()
        self.assertEqual(view.get_queryset().count(), 0)

    def test_vc_cannot_run_a_scan_station(self):
        """Event_Flows §11: Management does not appear in the event flow at all."""
        self.as_vc()
        response = self.client.post(
            f"/api/v1/participation/events/{self.event.id}/scan",
            {"token": services.live_pass(self.registration).token}, format="json")
        self.assertEqual(response.status_code, 403)
        self.registration.refresh_from_db()
        self.assertFalse(self.registration.attended)

    def test_no_prn_reaches_the_vc_from_any_endpoint_they_can_read(self):
        """The belt-and-braces check: sweep what the VC *can* read for PRNs."""
        self.as_vc()
        for path in ("/api/v1/reporting/reports/semester",
                     "/api/v1/governance/approvals/queue",
                     f"/api/v1/events/{self.event.id}",
                     "/api/v1/events",
                     "/api/v1/venue-calendar"):
            response = self.client.get(path)
            self.assertIn(response.status_code, (200, 403, 404), path)
            if response.status_code == 200:
                self.assertNotIn("23CS1002", response.content.decode(),
                                 f"{path} leaked a PRN to Management")
                self.assertNotIn("Meera A", response.content.decode(),
                                 f"{path} leaked a student name to Management")

    # ---- what the VC must still reach ----------------------------------
    def test_vc_still_gets_the_semester_report(self):
        self.as_vc()
        self.assertEqual(
            self.client.get("/api/v1/reporting/reports/semester").status_code, 200)

    def test_vc_still_sees_events_and_the_venue_calendar(self):
        self.as_vc()
        self.assertEqual(self.client.get("/api/v1/events").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/venue-calendar").status_code, 200)

    def test_vc_still_sees_above_threshold_budgets(self):
        """They approve them, so they must be able to read them."""
        big = f.event(self.club, f.venue("Open Air Theatre", 1000), title="Night",
                      days=30, expected=700)
        f.budget(big, amounts=(80000,))
        self.as_vc()
        self.assertEqual(self.client.get("/api/v1/budget/budgets").data["count"], 1)

    def test_the_capability_payload_tells_the_frontend_not_to_offer_rosters(self):
        self.as_vc()
        caps = self.client.get("/api/v1/module/auth/me").data["capabilities"]
        self.assertFalse(caps["can_see_individual_records"])
        self.assertTrue(caps["can_see_all_clubs"])

    # ---- the Dean is unaffected ----------------------------------------
    def test_the_dean_still_reads_rosters_and_attendee_lists(self):
        f.as_user(self.client, "dean@college.edu", mfa_code="1")
        self.assertEqual(
            self.client.get(f"/api/v1/clubs/{self.club.id}/members").status_code, 200)
        self.assertEqual(
            self.client.get(
                f"/api/v1/participation/events/{self.event.id}/roster").status_code, 200)

    def test_the_dean_still_does_not_run_scan_stations(self):
        """Event_Flows §10.3: "those sit with clubs"."""
        f.as_user(self.client, "dean@college.edu", mfa_code="1")
        response = self.client.post(
            f"/api/v1/participation/events/{self.event.id}/scan",
            {"token": services.live_pass(self.registration).token}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_the_society_approves_without_seeing_attendees(self):
        f.as_user(self.client, "society@college.edu", mfa_code="1")
        self.assertEqual(
            self.client.get(
                f"/api/v1/participation/events/{self.event.id}/roster").status_code, 404)
        self.assertEqual(
            self.client.get("/api/v1/governance/approvals/queue").status_code, 200)
