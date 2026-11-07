"""
Serving receipt files (PRD §5.19.4), through the FileStore seam.

The bytes never sit in the database; the view streams them from the local
bucket in standalone mode and redirects to the platform file service otherwise.
"""
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from budget.models import BudgetStage, ReceiptDocument
from common import roles as R
from events.models import EventStatus
from tests import factories as f

PDF = b"%PDF-1.4\n% a receipt for sound hire\n%%EOF\n"


class ReceiptFileTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.club = f.club("Swara")
        self.treasurer = f.student("treas@college.edu", prn="23CS1002")
        f.member(self.club, self.treasurer, R.CLUB_TREASURER)
        self.plain = f.student("member@college.edu", prn="23CS1003")
        f.member(self.club, self.plain, R.CLUB_MEMBER)
        self.outsider = f.student("outsider@college.edu", prn="23CS1004")
        f.user("dean@college.edu", global_roles=[R.DEAN], mfa=True)
        f.user("vc@college.edu", global_roles=[R.VICE_CHANCELLOR], mfa=True)
        f.user("society@college.edu", global_roles=[R.CULTURAL_SOCIETY], mfa=True)

        self.event = f.event(self.club, f.venue(), days=-3, status=EventStatus.REPORTED)
        self.budget = f.budget(self.event, amounts=(10000,))
        for line in self.budget.lines.all():
            line.amount_sanctioned = line.amount_requested
            line.save()
        self.budget.stage = BudgetStage.SANCTIONED
        self.budget.save()
        self.line = self.budget.lines.first()

    def upload(self, content=PDF, name="sound.pdf", content_type="application/pdf", **extra):
        f.as_user(self.client, "treas@college.edu")
        return self.client.post(
            f"/api/v1/budget/budgets/{self.budget.id}/lines/{self.line.id}/receipts",
            {"file": SimpleUploadedFile(name, content, content_type=content_type), **extra},
            format="multipart")

    def fetch(self, email, receipt_id, **kw):
        f.as_user(self.client, email, **kw)
        return self.client.get(f"/api/v1/budget/budgets/{self.budget.id}/lines/"
                               f"{self.line.id}/receipts/{receipt_id}/file")

    @staticmethod
    def body(response):
        return b"".join(response.streaming_content)

    # ---- the happy path ------------------------------------------------
    def test_the_treasurer_gets_the_bytes_with_the_stored_content_type(self):
        created = self.upload(vendor="Sound & Light Co", document_date="2026-03-14",
                              amount="7800")
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["vendor"], "Sound & Light Co")
        self.assertEqual(str(created.data["document_date"]), "2026-03-14")
        self.assertTrue(created.data["file_url"].endswith(f"/receipts/{created.data['id']}/file"))

        response = self.fetch("treas@college.edu", created.data["id"])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn("sound.pdf", response["Content-Disposition"])
        self.assertEqual(self.body(response), PDF)
        self.assertEqual(int(response["Content-Length"]), len(PDF))

    def test_only_pdfs_and_photographs_are_accepted(self):
        """QA F3. Exact allowlist: an SVG is an image by type and a script by content."""
        svg = b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"
        response = self.upload(content=svg, name="bill.svg", content_type="image/svg+xml")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data["code"], "BUDGET_RECEIPT_TYPE")
        for content_type in ("text/html", "application/octet-stream", "image/gif"):
            self.assertEqual(self.upload(content=b"x", name="x", content_type=content_type)
                             .status_code, 422, content_type)
        for content_type in ("image/jpeg", "image/webp", "image/heic", "application/pdf"):
            self.assertEqual(self.upload(content=b"x", name="x", content_type=content_type)
                             .status_code, 201, content_type)
        self.assertEqual(ReceiptDocument.objects.filter(content_type="image/svg+xml").count(), 0)

    def test_a_row_stored_with_a_type_outside_the_allowlist_is_never_rendered_inline(self):
        """
        QA F3, defence in depth: a receipt row stored before the allowlist was
        exact goes out as an opaque download, whatever its declared type says.
        """
        from budget import services as budget_services

        svg = b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"
        receipt = budget_services.attach_receipt(self.line, file_name="old.svg", content=svg,
                                                 content_type="image/svg+xml")
        response = self.fetch("treas@college.edu", receipt.id)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/octet-stream")
        self.assertTrue(response["Content-Disposition"].startswith("attachment"))
        self.assertEqual(response["Content-Security-Policy"], "sandbox")
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(self.body(response), svg)

    def test_inline_receipts_carry_the_sandbox_and_no_store_headers(self):
        created = self.upload()
        response = self.fetch("treas@college.edu", created.data["id"])
        self.assertTrue(response["Content-Disposition"].startswith("inline"))
        self.assertEqual(response["Content-Security-Policy"], "sandbox")
        self.assertEqual(response["Cache-Control"], "private, no-store")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")

    def test_an_image_keeps_its_own_content_type(self):
        png = b"\x89PNG\r\n\x1a\n not really a png"
        created = self.upload(content=png, name="bill.png", content_type="image/png")
        response = self.fetch("treas@college.edu", created.data["id"])
        self.assertEqual(response["Content-Type"], "image/png")
        self.assertEqual(self.body(response), png)

    def test_a_superseded_receipt_is_still_served(self):
        """The old row is evidence of what was first claimed; it stays retrievable."""
        first = self.upload(content=PDF + b"v1", name="first.pdf")
        second = self.upload(content=PDF + b"v2", name="second.pdf",
                             supersedes=first.data["id"])
        self.assertEqual(second.status_code, 201, second.data)
        old = ReceiptDocument.objects.get(pk=first.data["id"])
        self.assertFalse(old.is_current)

        response = self.fetch("treas@college.edu", first.data["id"])
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.body(response), PDF + b"v1")
        self.assertEqual(self.body(self.fetch("treas@college.edu", second.data["id"])),
                         PDF + b"v2")

    def test_reviewers_may_open_it(self):
        created = self.upload()
        for email in ("dean@college.edu", "society@college.edu", "vc@college.edu"):
            response = self.fetch(email, created.data["id"], mfa_code="1")
            self.assertEqual(response.status_code, 200, email)
            self.assertEqual(self.body(response), PDF, email)

    # ---- wrong-role tests ----------------------------------------------
    def test_a_plain_member_gets_404(self):
        created = self.upload()
        response = self.fetch("member@college.edu", created.data["id"])
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["code"], "NOT_FOUND")

    def test_an_unrelated_student_gets_404(self):
        created = self.upload()
        self.assertEqual(self.fetch("outsider@college.edu", created.data["id"]).status_code,
                         404)

    def test_an_unknown_receipt_is_404(self):
        self.upload()
        import uuid

        self.assertEqual(self.fetch("treas@college.edu", uuid.uuid4()).status_code, 404)

    def test_a_receipt_on_another_line_is_404(self):
        """The URL names the line; a receipt id from elsewhere does not resolve."""
        from budget.models import BudgetLine

        other_line = BudgetLine.objects.create(budget=self.budget, head="Other",
                                               amount_requested=100, position=5)
        created = self.upload()
        f.as_user(self.client, "treas@college.edu")
        response = self.client.get(f"/api/v1/budget/budgets/{self.budget.id}/lines/"
                                   f"{other_line.id}/receipts/{created.data['id']}/file")
        self.assertEqual(response.status_code, 404)

    # ---- the seam -------------------------------------------------------
    def test_a_missing_file_in_the_store_is_a_named_404(self):
        created = self.upload()
        receipt = ReceiptDocument.objects.get(pk=created.data["id"])
        receipt.file_key = "zz/does-not-exist.pdf"
        receipt.save(update_fields=["file_key"])
        response = self.fetch("treas@college.edu", receipt.id)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["code"], "BUDGET_RECEIPT_FILE_MISSING")

    def test_a_key_escaping_the_bucket_is_refused(self):
        created = self.upload()
        receipt = ReceiptDocument.objects.get(pk=created.data["id"])
        receipt.file_key = "../../manage.py"
        receipt.save(update_fields=["file_key"])
        response = self.fetch("treas@college.edu", receipt.id)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["code"], "BUDGET_RECEIPT_FILE_MISSING")

    def test_platform_mode_redirects_to_the_file_service_url(self):
        created = self.upload()

        class RemoteStore:
            def url_for(self, key):
                return f"https://files.portal.college.edu/{key}"

        with mock.patch("integrations.registry.file_store", return_value=RemoteStore()):
            response = self.fetch("treas@college.edu", created.data["id"])
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response["Location"].startswith("https://files.portal.college.edu/"))
        self.assertEqual(response["Cache-Control"], "private, no-store")

    def test_an_unreadable_document_date_is_refused(self):
        response = self.upload(document_date="14/03/2026")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(response.data["code"], "BUDGET_RECEIPT_DATE")
