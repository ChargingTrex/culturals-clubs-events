"""
Reporting additions by W4: the CSV export (B-10b), the two capture rates under
distinct names (B-11) and the Dean overview chase lists (B-10c).

The CSV tests reuse the hand-built overlap dataset from tests/test_reporting.py
with a second club in another category, so `by_category` has two rows to check.
"""
import csv
import io
from datetime import timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from clubs.models import Club
from common import roles as R
from events.models import EventStatus
from governance.models import ApprovalRequest, ApprovalStage
from participation import services
from tests import factories as f
from tests.test_jobs import unwired, wired


def parse_csv(text):
    """Rows grouped by their `section` tag; each row is a dict keyed by its block's header."""
    sections = {}
    header = None
    for row in csv.reader(io.StringIO(text.lstrip("\ufeff"))):
        if not row:
            header = None
            continue
        if row[0] == "section":
            header = row
            continue
        sections.setdefault(row[0], []).append(dict(zip(header[1:], row[1:])))
    return sections


class _OverlapDataset(TestCase):
    """
        event A (Swara, cultural):    s1 s2 s3 s4   (4)
        event B (Swara, cultural):    s1 s2 s5      (3)
        event C (Robo, technical):    s1 s6         (2)
    total 9, unique 6; cultural 7 across 2 events, technical 2 across 1.
    """

    def setUp(self):
        self.client = APIClient()
        self.semester = f.semester()
        self.swara = f.club("Swara")
        self.robo = f.club("Robo", category=Club.Category.TECHNICAL)
        self.organiser = f.student("org@college.edu", prn="23CS1000", name="Org Person")
        f.member(self.swara, self.organiser, R.CLUB_PRESIDENT)
        self.students = [
            f.student(f"s{i}@college.edu", prn=f"23CS100{i}", name=f"Student Number{i}",
                      dept="CSE" if i < 4 else "ECE")
            for i in range(1, 7)
        ]
        plan = [("A", self.swara, [0, 1, 2, 3]), ("B", self.swara, [0, 1, 4]), ("C", self.robo, [0, 5])]
        for index, (title, club, indices) in enumerate(plan):
            event = f.event(club, f.venue(f"Venue {title}", 300), title=title,
                            days=-10 + index, status=EventStatus.PUBLISHED)
            for i in indices:
                reg = services.register_student(event, self.students[i])
                services.resolve(services.live_pass(reg).token, event,
                                 operator=self.organiser.user, station_id="G1")
            event.status = EventStatus.REPORTED
            event.save()
            f.evidence(event, photos=3, links=["https://example.com/p/1"])
        f.user("dean@college.edu", global_roles=[R.DEAN], mfa=True)
        f.user("vc@college.edu", global_roles=[R.VICE_CHANCELLOR], mfa=True)
        f.user("society@college.edu", global_roles=[R.CULTURAL_SOCIETY], mfa=True)
        f.student("student@college.edu", prn="23CS1099", name="Plain Student")


class SemesterReportCSVTests(_OverlapDataset):
    def test_clubs_active_counts_only_clubs_that_ran_something(self):
        """QA F11: the key says what it counts; an idle club in the category is not in it."""
        f.club("Idle Choir")  # cultural, no events
        f.as_user(self.client, "dean@college.edu", mfa_code="1")
        [cultural] = [r for r in self.client.get("/api/v1/reporting/reports/semester").data["by_category"]
                      if r["category"] == "cultural"]
        self.assertEqual(cultural["clubs_active"], 1)
        self.assertNotIn("clubs", cultural)

    def test_by_category_is_in_the_json(self):
        f.as_user(self.client, "dean@college.edu", mfa_code="1")
        report = self.client.get("/api/v1/reporting/reports/semester").data
        self.assertEqual(report["by_category"], [
            {"category": "cultural", "clubs_active": 1, "events_run": 2, "attendance": 7},
            {"category": "technical", "clubs_active": 1, "events_run": 1, "attendance": 2},
        ])
        self.assertEqual(report["total_participation"], 9)
        self.assertEqual(report["unique_students"], 6)

    def test_csv_totals_equal_json_totals(self):
        f.as_user(self.client, "dean@college.edu", mfa_code="1")
        report = self.client.get("/api/v1/reporting/reports/semester").data
        response = self.client.get("/api/v1/reporting/reports/semester?format=csv")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response["Content-Type"].startswith("text/csv"))
        self.assertIn("attachment", response["Content-Disposition"])
        self.assertTrue(response.content.startswith("\ufeff".encode("utf-8")), "UTF-8 BOM for Excel (QA F7)")

        sections = parse_csv(response.content.decode())
        totals = {row["metric"]: row["value"] for row in sections["totals"]}
        for key in ("events_run", "total_participation", "unique_students",
                    "external_participants", "avg_attendance"):
            self.assertEqual(totals[key], str(report[key]), key)
        money = {row["metric"]: row["value"] for row in sections["money"]}
        self.assertEqual(money, report["money"])

        self.assertEqual(
            [(r["club"], r["category"], int(r["events_run"]), int(r["attendance"])) for r in sections["by_club"]],
            [(r["club"], r["category"], r["events_run"], r["attendance"]) for r in report["by_club"]],
        )
        self.assertEqual(
            [(r["category"], int(r["clubs_active"]), int(r["events_run"]), int(r["attendance"]))
             for r in sections["by_category"]],
            [(r["category"], r["clubs_active"], r["events_run"], r["attendance"]) for r in report["by_category"]],
        )
        self.assertEqual(
            [(r["department"], int(r["students_reached"]), int(r["attendance"]))
             for r in sections["by_department"]],
            [(r["department"], r["students_reached"], r["attendance"]) for r in report["by_department"]],
        )

    def test_the_csv_path_is_the_same_document(self):
        f.as_user(self.client, "dean@college.edu", mfa_code="1")
        by_query = self.client.get("/api/v1/reporting/reports/semester?format=csv")
        by_path = self.client.get("/api/v1/reporting/reports/semester/csv")
        self.assertEqual(by_path.status_code, 200)
        self.assertTrue(by_path["Content-Type"].startswith("text/csv"))
        self.assertEqual(by_path.content, by_query.content)

    def test_role_rules_match_the_json_route(self):
        for email, expected in (("dean@college.edu", 200), ("vc@college.edu", 200),
                                ("society@college.edu", 200), ("student@college.edu", 403)):
            f.as_user(self.client, email, mfa_code="1" if expected == 200 else "")
            for path in ("/api/v1/reporting/reports/semester?format=csv",
                         "/api/v1/reporting/reports/semester/csv",
                         "/api/v1/reporting/reports/semester"):
                response = self.client.get(path)
                self.assertEqual(response.status_code, expected, (email, path))
                if expected == 403:
                    self.assertEqual(response.data["code"], "REPORTING_DENIED")
                    self.assertTrue(response["Content-Type"].startswith("application/problem+json"))

    def test_an_unauthenticated_csv_request_still_gets_a_problem_document(self):
        response = self.client.get("/api/v1/reporting/reports/semester?format=csv")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["code"], "AUTH_REQUIRED")

    def test_the_csv_carries_no_individual_records(self):
        """AGENT_PROMPT §6: the VC gets aggregates only, in every format."""
        f.as_user(self.client, "vc@college.edu", mfa_code="1")
        body = self.client.get("/api/v1/reporting/reports/semester/csv").content.decode()
        self.assertNotIn("23CS", body)
        self.assertNotIn("Student Number", body)
        self.assertNotIn("Org Person", body)
        self.assertIn("by_club,", body)


class CaptureRateTests(TestCase):
    """
    MASTER_SPEC §7.6: two metrics, two names. A dataset where they differ:

        s1, s2  pass scanned, accepted           2 attempts, 2 accepted
        s1      pass scanned again -> duplicate  1 attempt, 0 accepted
        s3      manual PRN entry at the desk     1 attempt (spot_registered), 1 accepted
                                                 but source = manual

        scan_success_rate = 3 / 4 = 0.75      (accepted scans over attempts)
        scan_capture_rate = 2 / 3 = 0.667     (attended by scan over attended)
    """

    def setUp(self):
        self.client = APIClient()
        self.semester = f.semester()
        club = f.club()
        organiser = f.student("org@college.edu", prn="23CS1000")
        f.member(club, organiser, R.CLUB_PRESIDENT)
        s1, s2, s3 = (f.student(f"s{i}@college.edu", prn=f"23CS100{i}") for i in (1, 2, 3))
        self.event = f.event(club, f.venue(), days=-3, status=EventStatus.PUBLISHED)
        for student in (s1, s2):
            reg = services.register_student(self.event, student)
            services.resolve(services.live_pass(reg).token, self.event,
                             operator=organiser.user, station_id="G1")
        first_pass = self.event.registrations.get(student=s1).passes.first()
        services.resolve(first_pass.token, self.event, operator=organiser.user, station_id="G1")
        services.check_in_manually(self.event, s3, operator=organiser.user, station_id="DESK")
        self.event.status = EventStatus.REPORTED
        self.event.save()
        f.evidence(self.event, photos=1, links=["https://example.com/p"])
        f.user("dean@college.edu", global_roles=[R.DEAN], mfa=True)

    def test_the_two_rates_are_distinct_numbers_under_distinct_names(self):
        from reporting.services import capture_metrics

        capture = capture_metrics([self.event])
        self.assertEqual(capture["scan_attempts"], 4)
        self.assertEqual(capture["scans_accepted"], 3)
        self.assertEqual(capture["scan_success_rate"], 0.75)
        self.assertEqual(capture["attended"], 3)
        self.assertEqual(capture["attended_by_scan"], 2)
        self.assertEqual(capture["scan_capture_rate"], 0.667)
        self.assertNotEqual(capture["scan_success_rate"], capture["scan_capture_rate"])

    def test_capture_rate_is_an_alias_of_the_documents_definition(self):
        from reporting.services import capture_metrics

        capture = capture_metrics([self.event])
        self.assertEqual(capture["capture_rate"], capture["scan_capture_rate"])

    def test_the_overview_exposes_both(self):
        f.as_user(self.client, "dean@college.edu", mfa_code="1")
        capture = self.client.get("/api/v1/reporting/reports/overview").data["capture"]
        self.assertEqual(capture["scan_success_rate"], 0.75)
        self.assertEqual(capture["scan_capture_rate"], 0.667)
        self.assertEqual(capture["capture_rate"], 0.667)

    def test_rates_are_null_not_zero_when_there_is_nothing_to_measure(self):
        from reporting.services import capture_metrics

        capture = capture_metrics([])
        self.assertIsNone(capture["scan_success_rate"])
        self.assertIsNone(capture["scan_capture_rate"])


class DeanOverviewAdditionsTests(TestCase):
    """PRD §6.3 chase lists: dormant clubs, missing social links, escalated approvals."""

    def setUp(self):
        self.client = APIClient()
        self.semester = f.semester()
        self.club = f.club("Swara")
        self.dormant = f.club("Sleepy")
        self.dormant.status = Club.Status.DORMANT
        self.dormant.save()
        self.no_links = f.event(self.club, f.venue("A"), title="No Links", days=-4,
                                status=EventStatus.REPORTED)
        f.evidence(self.no_links, photos=2)
        self.no_photos = f.event(self.club, f.venue("B"), title="No Photos", days=-3,
                                 status=EventStatus.REPORTED)
        f.evidence(self.no_photos, links=["https://example.com/p"])
        self.complete = f.event(self.club, f.venue("C"), title="Complete", days=-2,
                                status=EventStatus.REPORTED)
        f.evidence(self.complete, photos=1, links=["https://example.com/q"])
        f.user("dean@college.edu", global_roles=[R.DEAN], mfa=True)
        f.user("vc@college.edu", global_roles=[R.VICE_CHANCELLOR], mfa=True)
        f.student("student@college.edu", prn="23CS1001")

    def overview(self):
        f.as_user(self.client, "dean@college.edu", mfa_code="1")
        response = self.client.get("/api/v1/reporting/reports/overview")
        self.assertEqual(response.status_code, 200)
        return response.data

    def test_dormant_clubs_counts_flagged_clubs_not_the_inactivity_proxy(self):
        data = self.overview()
        self.assertEqual(data["dormant_clubs"], 1)
        self.assertNotIn("Sleepy", data["clubs_inactive"], "dormant is not 'active but quiet'")

    def test_events_missing_social_links_sits_beside_the_photo_chase_list(self):
        data = self.overview()
        self.assertEqual([e["title"] for e in data["events_missing_social_links"]], ["No Links"])
        self.assertEqual([e["title"] for e in data["events_missing_photos"]], ["No Photos"])
        self.assertEqual({e["title"] for e in data["missing_evidence"]}, {"No Links", "No Photos"})

    def test_escalated_approvals_is_empty_until_b07_is_wired(self):
        with unwired("governance.services"):
            data = self.overview()
        self.assertEqual(data["escalated_approvals"], [])

    def test_escalated_approvals_once_wired(self):
        request = ApprovalRequest.objects.create(
            event=self.complete, stages=["dean"], current_stage=ApprovalStage.DEAN)
        ApprovalRequest.objects.filter(pk=request.pk).update(
            created_at=timezone.now() - timedelta(hours=72),
            stage_entered_at=timezone.now() - timedelta(hours=72))
        request.refresh_from_db()
        with wired("governance.services", "escalated_requests", lambda: [request]):
            data = self.overview()
        [row] = data["escalated_approvals"]
        self.assertEqual(row["event_title"], "Complete")
        self.assertEqual(row["club"], "Swara")
        self.assertEqual(row["stage"], "dean")
        self.assertEqual(row["age_hours"], 72.0)
        self.assertEqual(row["event_id"], str(self.complete.id))
        self.assertIsNotNone(row["stage_entered_at"])

    def test_the_age_is_stage_based_and_has_no_created_at_fallback(self):
        """QA F3: an old request freshly at a new gate is not old at that gate."""
        from reporting.services import escalation_summary

        request = ApprovalRequest.objects.create(
            event=self.complete, stages=["dean"], current_stage=ApprovalStage.DEAN)
        ApprovalRequest.objects.filter(pk=request.pk).update(
            created_at=timezone.now() - timedelta(hours=72))
        request.refresh_from_db()
        self.assertEqual(escalation_summary(request)["age_hours"], 0.0)
        self.assertIsNone(escalation_summary({"id": "x", "stage": "dean"})["age_hours"])

    def test_wrong_roles_cannot_read_the_overview(self):
        for email, mfa in (("vc@college.edu", "1"), ("student@college.edu", "")):
            f.as_user(self.client, email, mfa_code=mfa)
            response = self.client.get("/api/v1/reporting/reports/overview")
            self.assertEqual(response.status_code, 403, email)
            self.assertEqual(response.data["code"], "REPORTING_DENIED")
