"""
CSV export of the semester report (PRD §6.1; checklist B-10b).

One file, several blocks, each introduced by its own header row and tagged in
the first column so a spreadsheet filter on `section` isolates it. The numbers
are the ones the JSON route returns — the CSV is rendered from the same dict,
not recomputed — so the two cannot disagree. Aggregates only: no event roster,
no PRN, no name (AGENT_PROMPT §6; the VC may read this).
"""
import csv
import io

from rest_framework.renderers import BaseRenderer, JSONRenderer

TOTALS = ("events_run", "total_participation", "unique_students",
          "external_participants", "avg_attendance")


def semester_report_csv(report):
    out = io.StringIO()
    w = csv.writer(out)

    w.writerow(["section", "metric", "value"])
    semester = report["semester"]
    for key in ("name", "starts_on", "ends_on"):
        w.writerow(["semester", key, semester[key]])
    for key in TOTALS:
        w.writerow(["totals", key, report[key]])
    for key, value in report["money"].items():
        w.writerow(["money", key, value])

    w.writerow([])
    w.writerow(["section", "club_id", "club", "tag", "category", "events_run", "attendance"])
    for row in report["by_club"]:
        w.writerow(["by_club", row["club_id"], row["club"], row["tag"], row["category"],
                    row["events_run"], row["attendance"]])

    w.writerow([])
    w.writerow(["section", "category", "clubs", "events_run", "attendance"])
    for row in report["by_category"]:
        w.writerow(["by_category", row["category"], row["clubs"], row["events_run"], row["attendance"]])

    w.writerow([])
    w.writerow(["section", "department", "students_reached", "attendance"])
    for row in report["by_department"]:
        w.writerow(["by_department", row["department"], row["students_reached"], row["attendance"]])

    w.writerow([])
    w.writerow(["section", "caveat"])
    for caveat in report["caveats"]:
        w.writerow(["caveats", caveat])
    return out.getvalue()


class SemesterReportCSVRenderer(BaseRenderer):
    """
    Selected by `?format=csv` or the `/csv` path. An error raised on the route —
    403 REPORTING_DENIED, 422 REPORTING_NO_SEMESTER, 401 — still arrives here,
    and a problem document is JSON (RFC 9457) whatever the caller asked for.
    """

    media_type = "text/csv"
    format = "csv"
    charset = "utf-8"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        if _is_problem(data):
            return JSONRenderer().render(data, "application/json", renderer_context)
        return semester_report_csv(data).encode(self.charset)


def _is_problem(data):
    return isinstance(data, dict) and {"code", "title", "status"} <= set(data)
