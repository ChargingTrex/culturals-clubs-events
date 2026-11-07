"""
The annual club envelope with running utilisation (PRD §5.7.3, §5.19.5).

Utilisation is derived from the budgets, never stored: only sanctioned and
settled budgets for events starting in the envelope's year count against it.
"""
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from budget import services as budget_services
from budget.models import BudgetStage, ClubBudgetEnvelope
from common import roles as R
from events.models import EventStatus
from governance.models import AuditEntry
from tests import factories as f


class EnvelopeTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.year = timezone.localdate().year
        self.club = f.club("Swara")
        self.other = f.club("Lens")
        self.venue = f.venue()
        self.president = f.student("pres@college.edu", prn="23CS1001")
        f.member(self.club, self.president, R.CLUB_PRESIDENT)
        self.treasurer = f.student("treas@college.edu", prn="23CS1002")
        f.member(self.club, self.treasurer, R.CLUB_TREASURER)
        self.plain = f.student("member@college.edu", prn="23CS1003")
        f.member(self.club, self.plain, R.CLUB_MEMBER)
        self.rival = f.student("rival@college.edu", prn="23CS1004")
        f.member(self.other, self.rival, R.CLUB_TREASURER)
        f.user("dean@college.edu", name="Dean", global_roles=[R.DEAN], mfa=True)
        f.user("vc@college.edu", name="VC", global_roles=[R.VICE_CHANCELLOR], mfa=True)
        f.user("society@college.edu", name="Society", global_roles=[R.CULTURAL_SOCIETY],
               mfa=True)
        f.user("admin@college.edu", name="Admin", global_roles=[R.ADMIN], mfa=True)

        # Sanctioned: 10,000 requested, 8,000 sanctioned.
        sanctioned = self.budget_at(BudgetStage.SANCTIONED, "Sanctioned", days=10,
                                    requested=10000, sanctioned=8000)
        # Settled: 5,000 sanctioned, 4,500 actually spent.
        self.budget_at(BudgetStage.SETTLED, "Settled", days=-10, requested=5000,
                       sanctioned=5000, spent=4500, status=EventStatus.REPORTED)
        # Under review, returned and draft: committed nothing yet.
        self.budget_at(BudgetStage.DEAN_REVIEW, "Pending", days=20, requested=7000)
        self.budget_at(BudgetStage.RETURNED, "Returned", days=25, requested=9000)
        self.budget_at(BudgetStage.DRAFT, "Draft", days=30, requested=3000)
        # Sanctioned, but last year: belongs to last year's envelope.
        last_year = self.budget_at(BudgetStage.SANCTIONED, "Last year", days=-400,
                                   requested=6000, sanctioned=6000,
                                   status=EventStatus.REPORTED)
        self.assertNotEqual(last_year.event.starts_at.year, self.year)
        # Another club's sanctioned budget must not leak into Swara's figure.
        rival_event = f.event(self.other, self.venue, title="Lens show", days=15,
                              status=EventStatus.PUBLISHED)
        rival_budget = f.budget(rival_event, amounts=(20000,))
        for line in rival_budget.lines.all():
            line.amount_sanctioned = line.amount_requested
            line.save()
        rival_budget.stage = BudgetStage.SANCTIONED
        rival_budget.save()
        self.sanctioned = sanctioned

    def budget_at(self, stage, title, *, days, requested, sanctioned=None, spent=None,
                  status=EventStatus.PUBLISHED):
        event = f.event(self.club, self.venue, title=title, days=days, status=status)
        budget = f.budget(event, amounts=(requested,))
        for line in budget.lines.all():
            if sanctioned is not None:
                line.amount_sanctioned = Decimal(sanctioned)
            if spent is not None:
                line.amount_spent = Decimal(spent)
            line.save()
        budget.stage = stage
        if stage == BudgetStage.SETTLED:
            budget.settled_at = timezone.now()
        budget.save()
        return budget

    def get(self, email, club=None, **kw):
        f.as_user(self.client, email, **kw)
        return self.client.get(f"/api/v1/budget/envelopes/{(club or self.club).id}")

    def put(self, email, amount, year=None, **kw):
        f.as_user(self.client, email, **kw)
        return self.client.put(f"/api/v1/budget/envelopes/{self.club.id}",
                               {"year": year or self.year, "amount": str(amount)},
                               format="json")

    # ---- the figure -----------------------------------------------------
    def test_utilisation_sums_only_sanctioned_and_settled_budgets_of_this_year(self):
        summary = budget_services.envelope_summary(self.club.id, self.year)
        self.assertEqual(summary["sanctioned_to_date"], Decimal("13000.00"))
        self.assertEqual(summary["settled_to_date"], Decimal("4500.00"))
        self.assertIsNone(summary["amount"], "no envelope set yet")
        self.assertIsNone(summary["remaining"])

    def test_remaining_is_the_envelope_less_what_is_sanctioned(self):
        response = self.put("dean@college.edu", 100000, mfa_code="1")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["amount"], "100000.00")
        self.assertEqual(response.data["sanctioned_to_date"], "13000.00")
        self.assertEqual(response.data["settled_to_date"], "4500.00")
        self.assertEqual(response.data["remaining"], "87000.00")
        self.assertEqual(response.data["set_by"], "Dean")

    def test_last_years_sanction_counts_against_last_years_envelope(self):
        summary = budget_services.envelope_summary(self.club.id, self.year - 1)
        self.assertEqual(summary["sanctioned_to_date"], Decimal("6000.00"))

    def test_setting_the_same_year_again_replaces_rather_than_duplicates(self):
        self.put("dean@college.edu", 100000, mfa_code="1")
        self.put("admin@college.edu", 120000, mfa_code="1")
        self.assertEqual(ClubBudgetEnvelope.objects.filter(club=self.club).count(), 1)
        self.assertEqual(self.get("treas@college.edu").data["amount"], "120000.00")
        entries = AuditEntry.objects.filter(action="budget.envelope_set").order_by("created_at")
        self.assertEqual(entries.count(), 2)
        self.assertEqual(entries.last().before, {"amount": "100000.00"})

    def test_the_database_refuses_two_envelopes_for_one_year(self):
        from django.db import IntegrityError, transaction

        ClubBudgetEnvelope.objects.create(club=self.club, year=self.year, amount=1)
        with self.assertRaises(IntegrityError), transaction.atomic():
            ClubBudgetEnvelope.objects.create(club=self.club, year=self.year, amount=2)

    def test_a_negative_envelope_is_refused(self):
        response = self.put("dean@college.edu", -1, mfa_code="1")
        self.assertEqual(response.status_code, 422)

    # ---- who may see it --------------------------------------------------
    def test_officers_and_staff_can_read_it(self):
        for email, code in (("pres@college.edu", ""), ("treas@college.edu", ""),
                            ("dean@college.edu", "1"), ("vc@college.edu", "1"),
                            ("society@college.edu", "1"), ("admin@college.edu", "1")):
            response = self.get(email, mfa_code=code)
            self.assertEqual(response.status_code, 200, email)
            self.assertEqual(response.data["sanctioned_to_date"], "13000.00", email)

    def test_a_plain_member_gets_404(self):
        """AGENT_PROMPT §6: a club member has no budget visibility — not even the total."""
        response = self.get("member@college.edu")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["code"], "NOT_FOUND")

    def test_another_clubs_officer_gets_404(self):
        self.assertEqual(self.get("rival@college.edu").status_code, 404)
        self.assertEqual(self.get("treas@college.edu", club=self.other).status_code, 404)

    # ---- who may set it --------------------------------------------------
    def test_the_treasurer_cannot_set_it(self):
        response = self.put("treas@college.edu", 100000)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "BUDGET_ENVELOPE_DENIED")
        self.assertEqual(ClubBudgetEnvelope.objects.count(), 0)

    def test_the_society_and_the_vc_cannot_set_it(self):
        for email in ("society@college.edu", "vc@college.edu"):
            response = self.put(email, 100000, mfa_code="1")
            self.assertEqual(response.status_code, 403, email)
            self.assertEqual(response.data["code"], "BUDGET_ENVELOPE_DENIED")

    def test_a_plain_member_setting_it_is_404_not_403(self):
        self.assertEqual(self.put("member@college.edu", 100000).status_code, 404)

    # ---- the year ---------------------------------------------------------
    def test_an_out_of_range_or_unreadable_year_is_422_not_500(self):
        """QA F4. `?year=10000` must never reach a datetime the database cannot build."""
        f.as_user(self.client, "treas@college.edu")
        for raw in ("10000", "0", "1999", "2101", "abc", "20.5"):
            response = self.client.get(f"/api/v1/budget/envelopes/{self.club.id}", {"year": raw})
            self.assertEqual(response.status_code, 422, raw)
            self.assertEqual(response.data["code"], "BUDGET_ENVELOPE_YEAR", raw)
        for raw in ("2000", "2100", str(self.year)):
            response = self.client.get(f"/api/v1/budget/envelopes/{self.club.id}", {"year": raw})
            self.assertEqual(response.status_code, 200, raw)
            self.assertEqual(response.data["year"], int(raw))

    def test_the_year_is_read_in_the_display_time_zone(self):
        """
        QA F6 / decision E-11: calendar year in DISPLAY_TIME_ZONE. An event at
        00:30 IST on 1 January is 19:00 UTC on 31 December; it belongs to the
        new year's envelope, both in the summary and on the budget's block.
        """
        from datetime import datetime, timedelta
        from zoneinfo import ZoneInfo

        ist = ZoneInfo("Asia/Kolkata")
        target = self.year + 1
        starts = datetime(target, 1, 1, 0, 30, tzinfo=ist)
        self.assertEqual(starts.astimezone(ZoneInfo("UTC")).year, target - 1)
        event = f.event(self.club, self.venue, title="New Year Gig", days=1,
                        status=EventStatus.PUBLISHED)
        event.starts_at, event.ends_at = starts, starts + timedelta(hours=2)
        event.save(update_fields=["starts_at", "ends_at"])
        budget = f.budget(event, amounts=(2500,))
        for line in budget.lines.all():
            line.amount_sanctioned = line.amount_requested
            line.save()
        budget.stage = BudgetStage.SANCTIONED
        budget.save()

        self.assertEqual(budget_services.envelope_summary(self.club.id, target)
                         ["sanctioned_to_date"], Decimal("2500.00"))
        self.assertEqual(budget_services.envelope_summary(self.club.id, target - 1)
                         ["sanctioned_to_date"], Decimal("13000.00"),
                         "this year's figure is unchanged by the 1 January event")
        f.as_user(self.client, "treas@college.edu")
        detail = self.client.get(f"/api/v1/budget/budgets/{budget.id}").data
        self.assertEqual(detail["envelope"]["year"], target)
        self.assertEqual(detail["envelope"]["sanctioned_to_date"], "2500.00")

    # ---- on the budget list ---------------------------------------------
    def test_the_budget_list_carries_the_envelope_for_officers(self):
        self.put("dean@college.edu", 100000, mfa_code="1")
        f.as_user(self.client, "treas@college.edu")
        page = self.client.get("/api/v1/budget/budgets").data
        this_year = next(b for b in page["results"] if b["id"] == str(self.sanctioned.id))
        self.assertEqual(this_year["envelope"], {
            "year": self.year, "amount": "100000.00", "sanctioned_to_date": "13000.00",
            "settled_to_date": "4500.00", "remaining": "87000.00",
        })
        detail = self.client.get(f"/api/v1/budget/budgets/{self.sanctioned.id}").data
        self.assertEqual(detail["envelope"]["remaining"], "87000.00")
