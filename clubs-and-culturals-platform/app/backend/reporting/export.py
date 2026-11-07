"""
CSV export of the semester report (PRD §6.1; checklist B-10b).

One file, several blocks, each introduced by its own header row and tagged in
the first column so a spreadsheet filter on `section` isolates it. The numbers
are the ones the JSON route returns — the CSV is rendered from the same dict,
not recomputed — so the two cannot disagree. Aggregates only: no event roster,
no PRN, no name (AGENT_PROMPT §6; the VC may read this). Cells that would read
as a spreadsheet formula are neutralised and the file carries a UTF-8 BOM.
"""
import csv
import io

from rest_framework.renderers import BaseRenderer, JSONRenderer

TOTALS = ("events_run", "total_participation", "unique_students",
          "external_participants", "avg_attendance")


# A cell starting with one of these is a formula to Excel and LibreOffice (QA
# F6). A club or tag name is Dean/Admin-controlled, but a report the VC opens
# must not be the place that trust is tested.
_FORMULA_LEADERS = ("=", "+", "-", "@", "\t", "\r")


def _safe(cell):
    if isinstance(cell, str) and cell.startswith(_FORMULA_LEADERS):
        return "'" + cell
    return cell


class _SafeWriter:
    def __init__(self, stream):
        self._w = csv.writer(stream)

    def writerow(self, row):
        self._w.writerow([_safe(cell) for cell in row])


def semester_report_csv(report):
    out = io.StringIO()
    # UTF-8 BOM so Excel on Windows reads non-ASCII club names correctly (QA F7).
    out.write("\ufeff")
    w = _SafeWriter(out)

    w.writerow(["section", "metric", "value"])
    semester = report["semester"]
    for key in ("name", "starts_on", "ends_on"):
        w.writerow(["semester", key, semester[key]])
    for key in TOTALS:
        w.writerow(["totals", key, report[key]])
    for key, value in report["money"].items():
        w.writerow(["money", key, value])
    outreach = report["outreach"]
    for key in ("events_promoted", "events_completed", "instagram", "linkedin"):
        w.writerow(["outreach", key, outreach[key]])

    w.writerow([])
    w.writerow(["section", "club_id", "club", "tag", "category", "events_run", "attendance"])
    for row in report["by_club"]:
        w.writerow(["by_club", row["club_id"], row["club"], row["tag"], row["category"],
                    row["events_run"], row["attendance"]])

    w.writerow([])
    w.writerow(["section", "category", "clubs_active", "events_run", "attendance"])
    for row in report["by_category"]:
        w.writerow(["by_category", row["category"], row["clubs_active"], row["events_run"], row["attendance"]])

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
