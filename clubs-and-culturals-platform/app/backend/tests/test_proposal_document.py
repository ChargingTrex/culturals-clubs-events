"""
AR-10: a club attaches its proposal document to the event it is proposing, and
prices the budget either from an uploaded sheet or by having the Treasurer type
it in. The document is for the club's office bearers and the reviewing staff.
"""
import io
import tempfile
import zipfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from common import roles as R
from events.models import EventStatus
from governance import services as governance
from integrations import registry
from integrations.files import LocalFileStore
from tests import factories as f

PDF = b"%PDF-1.4 proposal"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


def docx(body_xml, *, name="word/document.xml"):
    """A minimal .docx: a zip holding the body XML."""
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as archive:
        archive.writestr(name, f'<?xml version="1.0"?><w:document xmlns:w="{W}">'
                               f"<w:body>{body_xml}</w:body></w:document>")
    return out.getvalue()


PLAN = docx(
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Swara Unplugged</w:t></w:r></w:p>'
    "<w:p><w:r><w:t>An acoustic </w:t></w:r><w:r><w:t>evening.</w:t></w:r></w:p>"
    "<w:p></w:p>"
    "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Sound</w:t></w:r></w:p></w:tc>"
    "<w:tc><w:p><w:r><w:t>12000</w:t></w:r></w:p></w:tc></w:tr></w:tbl>")


class ProposalDocumentTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        store = LocalFileStore(root=self.tmp.name)
        self._original = registry.file_store
        registry.file_store = lambda: store
        self.addCleanup(lambda: setattr(registry, "file_store", self._original))

        f.semester()
        self.club = f.club("Swara")
        self.venue = f.venue()
        self.president = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        self.treasurer = f.student("treas@college.edu", prn="23CS1002")
        f.member(self.club, self.treasurer, R.CLUB_TREASURER)
        self.plain = f.student("member@college.edu", prn="23CS1003")
        f.member(self.club, self.plain, R.CLUB_MEMBER)
        f.student("outsider@college.edu", prn="23CS1004")
        f.user("sec@college.edu", global_roles=[R.SOCIETY_SECRETARY], mfa=True)
        self.event = f.event(self.club, self.venue, title="Swara Unplugged")
        self.url = f"/api/v1/events/{self.event.id}/proposal-document"

    def upload(self, email, name="proposal.pdf", content=PDF, content_type="application/pdf"):
        f.as_user(self.client, email, mfa_code="1")
        return self.client.post(
            self.url, {"file": SimpleUploadedFile(name, content, content_type=content_type)},
            format="multipart")

    def event_body(self, email):
        f.as_user(self.client, email, mfa_code="1")
        return self.client.get(f"/api/v1/events/{self.event.id}")

    def test_an_office_bearer_attaches_the_proposal_and_it_shows_on_the_event(self):
        response = self.upload("pres@college.edu")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["file_name"], "proposal.pdf")
        doc = self.event_body("treas@college.edu").data["proposal_document"]
        self.assertEqual(doc["file_name"], "proposal.pdf")
        self.assertEqual(doc["byte_size"], len(PDF))
        self.assertEqual(doc["file_url"], f"{self.url}/file")

    def test_the_file_downloads_for_the_club_and_for_the_reviewing_staff(self):
        self.upload("pres@college.edu")
        for email in ("pres@college.edu", "treas@college.edu", "sec@college.edu"):
            f.as_user(self.client, email, mfa_code="1")
            response = self.client.get(f"{self.url}/file")
            self.assertEqual(response.status_code, 200, email)
            self.assertEqual(b"".join(response.streaming_content), PDF)

    def test_a_word_document_is_accepted_by_its_extension(self):
        self.assertEqual(self.upload("pres@college.edu", "plan.docx", b"PK..", DOCX).status_code, 201)
        self.assertEqual(
            self.upload("pres@college.edu", "plan.docx", b"PK..", "application/octet-stream").status_code,
            201)

    def test_a_replacement_becomes_the_current_document_and_the_old_row_stays(self):
        self.upload("pres@college.edu")
        self.upload("pres@college.edu", "proposal-v2.pdf", PDF + b" v2")
        self.assertEqual(self.event.proposal_documents.count(), 2)
        self.assertEqual(self.event_body("pres@college.edu").data["proposal_document"]["file_name"],
                         "proposal-v2.pdf")

    def test_other_file_types_empty_files_and_no_file_are_refused(self):
        for name, content, kind in (("budget.xlsx", b"PK", "application/vnd.ms-excel"),
                                    ("run.pdf.exe", b"MZ", "application/pdf"),
                                    ("photo.pdf", b"\xff\xd8", "image/jpeg")):
            response = self.upload("pres@college.edu", name, content, kind)
            self.assertEqual(response.status_code, 422, name)
            self.assertEqual(response.data["code"], "EVENTS_FILE_TYPE")
        self.assertEqual(self.upload("pres@college.edu", content=b"").data["code"], "EVENTS_FILE_EMPTY")
        f.as_user(self.client, "pres@college.edu")
        self.assertEqual(self.client.post(self.url, {}, format="multipart").data["code"],
                         "EVENTS_FILE_MISSING")
        self.assertEqual(self.event.proposal_documents.count(), 0)

    def test_a_plain_member_and_an_outsider_cannot_attach_or_read_it(self):
        self.upload("pres@college.edu")
        self.assertEqual(self.upload("member@college.edu").status_code, 403)
        self.assertIsNone(self.event_body("member@college.edu").data["proposal_document"])
        self.assertEqual(self.client.get(f"{self.url}/file").status_code, 404)
        self.assertEqual(self.upload("outsider@college.edu").status_code, 404)

    def test_a_student_sees_a_published_event_but_not_its_proposal(self):
        self.upload("pres@college.edu")
        self.event.status = EventStatus.PUBLISHED
        self.event.save(update_fields=["status"])
        body = self.event_body("outsider@college.edu")
        self.assertEqual(body.status_code, 200)
        self.assertIsNone(body.data["proposal_document"])
        self.assertEqual(self.client.get(f"{self.url}/file").status_code, 404)

    def test_the_document_is_locked_once_the_proposal_is_submitted(self):
        self.upload("pres@college.edu")
        f.budget(self.event)
        governance.submit(self.event, actor=f.ctx_for(self.president.user),
                          actor_user=self.president.user)
        response = self.upload("pres@college.edu", "swapped.pdf")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "EVENTS_LOCKED")
        # The approver reads what was submitted.
        self.assertEqual(self.event_body("sec@college.edu").data["proposal_document"]["file_name"],
                         "proposal.pdf")

    def test_the_budget_sheet_goes_in_with_the_proposal_then_it_is_sent(self):
        """The upload path of AR-10: draft, document, budget CSV, submit."""
        f.as_user(self.client, "pres@college.edu")
        created = self.client.post("/api/v1/events", {
            "club": str(self.club.id), "title": "Sheet Night", "kind": "performance",
            "venue": str(f.venue("Hall B", 200).id),
            "starts_at": f.slot(days=9, hour=17).isoformat(),
            "ends_at": f.slot(days=9, hour=19).isoformat(),
            "capacity": 100, "expected_attendance": 80, "submit": False,
        }, format="json").data
        self.assertEqual(created["status"], "draft")
        sheet = SimpleUploadedFile("budget.csv", b"head,amount\nSound,12000\nPrinting,1500\n",
                                   content_type="text/csv")
        imported = self.client.post(f"/api/v1/budget/budgets/{created['budget']['id']}/lines/import",
                                    {"file": sheet, "mode": "replace"}, format="multipart")
        self.assertEqual(imported.status_code, 200, imported.data)
        sent = self.client.post(f"/api/v1/events/{created['id']}/submit")
        self.assertEqual(sent.status_code, 200, sent.data)

    # ---- AR-11: preview ------------------------------------------------
    def preview(self, email):
        f.as_user(self.client, email, mfa_code="1")
        return self.client.get(f"{self.url}/preview")

    def test_a_pdf_is_previewed_as_the_file_itself(self):
        self.assertEqual(self.upload("pres@college.edu").data["preview"], "pdf")
        self.assertEqual(self.preview("pres@college.edu").data["code"], "EVENTS_PREVIEW_UNAVAILABLE")

    def test_a_word_proposal_is_previewed_as_its_text(self):
        uploaded = self.upload("pres@college.edu", "plan.docx", PLAN, DOCX)
        self.assertEqual(uploaded.data["preview"], "text")
        for email in ("treas@college.edu", "sec@college.edu"):
            response = self.preview(email)
            self.assertEqual(response.status_code, 200, email)
            self.assertEqual(response.data["blocks"], [
                {"kind": "heading", "text": "Swara Unplugged"},
                {"kind": "paragraph", "text": "An acoustic evening."},
                {"kind": "row", "text": "Sound | 12000"},
            ])
            self.assertFalse(response.data["truncated"])

    def test_a_legacy_doc_has_no_preview(self):
        uploaded = self.upload("pres@college.edu", "plan.doc", b"\xd0\xcf\x11\xe0", "application/msword")
        self.assertEqual(uploaded.data["preview"], "none")
        self.assertEqual(self.preview("pres@college.edu").status_code, 422)

    def test_a_file_that_is_not_really_a_docx_is_refused_not_crashed_on(self):
        for content in (b"not a zip", docx("<w:p/>", name="other.xml"),
                        docx('<!DOCTYPE x [<!ENTITY a "b">]><w:p/>')):
            self.upload("pres@college.edu", "plan.docx", content, DOCX)
            response = self.preview("pres@college.edu")
            self.assertEqual(response.status_code, 422)
            self.assertEqual(response.data["code"], "EVENTS_PREVIEW_UNREADABLE")

    def test_the_preview_is_hidden_from_those_who_cannot_read_the_document(self):
        self.upload("pres@college.edu", "plan.docx", PLAN, DOCX)
        self.assertEqual(self.preview("member@college.edu").status_code, 404)
        self.event.status = EventStatus.PUBLISHED
        self.event.save(update_fields=["status"])
        self.assertEqual(self.preview("outsider@college.edu").status_code, 404)
