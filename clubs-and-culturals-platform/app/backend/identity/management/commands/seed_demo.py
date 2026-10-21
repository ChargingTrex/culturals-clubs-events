"""
Seed the demo dataset.

Carried over from the prototype's `seed()`, including the deliberate attendance
overlap: some students attend several events, so unique_students is meaningfully
lower than total_participation. Without that overlap the report's headline figure
looks correct whether or not the DISTINCT count is right.
"""
import random
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from budget.models import BudgetTemplate, BudgetTemplateLine
from budget.services import seed_from_template
from clubs.models import Club, Membership
from common import roles as R
from events.models import Event, EventStatus, Venue
from governance import services as governance
from governance.models import ApprovalState, Decision
from identity.models import ReferenceCode, Semester, Student, User
from identity.authentication import AuthContext
from integrations.base import Claims
from participation import services as participation

FIRST = ["Meera", "Arjun", "Kavya", "Rohan", "Divya", "Karthik", "Ananya", "Vikram",
         "Sneha", "Aditya", "Lakshmi", "Rahul", "Priya", "Surya", "Nithya", "Harish",
         "Deepa", "Vishnu", "Aishwarya", "Gokul", "Janani", "Pranav", "Shruti", "Ashwin",
         "Keerthana", "Sanjay", "Revathi", "Naveen", "Pooja", "Bharath", "Swathi", "Mani",
         "Harini", "Dinesh", "Varsha", "Ramesh", "Anjali", "Sathish", "Madhu", "Tarun"]
LAST = ["Krishnan", "Iyer", "R", "Subramanian", "Nair", "S", "Raghavan", "Menon", "K",
        "Venkatesh", "Pillai", "M", "Balaji", "Chandran", "A", "Sundar"]
DEPTS = [("CSE", "BTech-CSE"), ("ECE", "BTech-ECE"), ("BBA", "BBA"),
         ("ARTS", "BA-English"), ("MECH", "BTech-MECH"), ("LAW", "BA-LLB")]

CLUBS = [
    ("Swara", "Music", Club.Category.CULTURAL, "@swara.saiu"),
    ("Natya", "Dance", Club.Category.CULTURAL, "@natya.saiu"),
    ("Kalam", "Literary", Club.Category.LITERARY, "@kalam.saiu"),
    ("Lens", "Photography", Club.Category.CULTURAL, "@lens.saiu"),
    ("Drishti", "Theatre", Club.Category.CULTURAL, "@drishti.saiu"),
]
VENUES = [("Main Auditorium", 600), ("Open Air Theatre", 1000), ("Seminar Hall A", 150),
          ("Seminar Hall B", 120), ("Amphitheatre", 300), ("Music Room", 40)]

TEMPLATES = {
    "Performance": [("Sound & lighting", "lump_sum", 12000), ("Stage & decoration", "lump_sum", 8000),
                    ("Refreshments", "per_head", 60), ("Publicity", "lump_sum", 2000)],
    "Workshop": [("Trainer honorarium", "lump_sum", 8000), ("Materials", "per_head", 150),
                 ("Refreshments", "per_head", 50), ("Certificates", "per_head", 20)],
    "Competition": [("Prizes", "lump_sum", 6000), ("Judges' honorarium", "lump_sum", 3000),
                    ("Refreshments", "per_head", 50), ("Printing", "lump_sum", 800)],
    "Exhibition": [("Printing & framing", "lump_sum", 9000), ("Display stands", "lump_sum", 4000),
                   ("Publicity", "lump_sum", 1500)],
}

PASSWORD = "culturals-demo"


def ctx_for(user):
    """An AuthContext for a seeded user, so seeding goes through the real services."""
    from identity.tokens import roles_for

    student = user.student
    return AuthContext(Claims(
        sub=str(user.id), email=user.email, display_name=user.display_name,
        student_id=str(student.id) if student else None,
        prn=student.prn if student else None, roles=tuple(roles_for(user)),
        department=student.department if student else None,
        programme=student.programme if student else None,
        year=student.year_of_study if student else None,
        mfa=any(r in R.MFA_REQUIRED_ROLES for r in (user.global_roles or [])),
    ))


class Command(BaseCommand):
    help = "Seed clubs, students, events, approvals and attendance for the demo."

    def add_arguments(self, parser):
        parser.add_argument("--flush", action="store_true",
                            help="Delete existing module data first.")

    @transaction.atomic
    def handle(self, *args, **options):
        if options["flush"]:
            for model in (Event, Club, Student, Semester, Venue, BudgetTemplate):
                model.objects.all().delete()
            User.objects.filter(is_superuser=False).delete()

        rng = random.Random(42)
        today = timezone.localdate()

        semester = Semester.objects.create(
            name="Monsoon 2026", starts_on=today - timedelta(days=70),
            ends_on=today + timedelta(days=84), is_current=True,
        )
        for code, name in DEPTS:
            ReferenceCode.objects.get_or_create(kind=ReferenceCode.Kind.DEPARTMENT, code=code,
                                                defaults={"name": code})
            ReferenceCode.objects.get_or_create(kind=ReferenceCode.Kind.PROGRAMME, code=name,
                                                defaults={"name": name})

        venues = {name: Venue.objects.create(name=name, capacity=cap) for name, cap in VENUES}
        clubs = {
            name: Club.objects.create(name=name, slug=name.lower(), tag=tag, category=cat,
                                      instagram_handle=ig)
            for name, tag, cat, ig in CLUBS
        }

        for tname, lines in TEMPLATES.items():
            template = BudgetTemplate.objects.create(name=tname, event_kind=tname.lower())
            for position, (head, basis, rate) in enumerate(lines):
                BudgetTemplateLine.objects.create(template=template, head=head, basis=basis,
                                                  rate=Decimal(rate), position=position)

        # ---- students -------------------------------------------------
        students = []
        for i in range(64):
            dept, programme = DEPTS[rng.randrange(len(DEPTS))]
            year = rng.randint(1, 4)
            name = f"{FIRST[i % len(FIRST)]} {LAST[rng.randrange(len(LAST))]}"
            prn = f"{26 - year}{dept[:2]}{1001 + i}"
            user = User.objects.create_user(
                email=f"{prn.lower()}@college.edu", password=PASSWORD, full_name=name,
                display_name=name.split()[0], global_roles=[R.STUDENT],
            )
            students.append(Student.objects.create(
                user=user, prn=prn, full_name=name, department=dept, programme=programme,
                year_of_study=year,
            ))

        # ---- staff ----------------------------------------------------
        def staff(email, name, role):
            return User.objects.create_user(email=email, password=PASSWORD, full_name=name,
                                           display_name=name, global_roles=[role],
                                           mfa_enabled=True, is_staff=(role == R.ADMIN))

        dean = staff("dean@college.edu", "Dr. Revathi Srinivasan", R.DEAN)
        vc = staff("vc@college.edu", "Prof. K. Ramanathan", R.VICE_CHANCELLOR)
        society = staff("cultural.secretary@college.edu", "Nivedita Raman", R.CULTURAL_SOCIETY)

        # ---- memberships ----------------------------------------------
        office = [R.CLUB_PRESIDENT, R.CLUB_VICE_PRESIDENT, R.CLUB_TREASURER, R.CLUB_SECRETARY]
        cursor = 0
        club_officers = {}
        for club in clubs.values():
            size = 8 if club.name != "Swara" else 14
            people = students[cursor:cursor + size]
            cursor += size
            for index, student in enumerate(people):
                role = office[index] if index < len(office) else (
                    R.CLUB_CORE if index < 7 else R.CLUB_MEMBER)
                Membership.objects.create(club=club, student=student, role=role)
            club_officers[club.name] = {
                "president": people[0], "vice_president": people[1],
                "treasurer": people[2], "secretary": people[3],
            }

        # ---- events ---------------------------------------------------
        def at(days_from_today, hour, minute=0):
            local = datetime.combine(today + timedelta(days=days_from_today),
                                     time(hour, minute))
            return timezone.make_aware(local)

        specs = [
            # title, club, offset, start, end, venue, template, expected, status
            ("Swara Unplugged", "Swara", -17, 18, 20, "Amphitheatre", "Performance", 120, "reported"),
            ("Natya Showcase", "Natya", -10, 17, 20, "Main Auditorium", "Performance", 250, "reported"),
            ("Kalam Poetry Slam", "Kalam", -7, 16, 18, "Seminar Hall B", "Competition", 60, "reported"),
            ("Lens Frames Exhibition", "Lens", -24, 10, 16, "Seminar Hall A", "Exhibition", 80, "reported"),
            ("Lens Heritage Photowalk", "Lens", 0, 16, 18, "Open Air Theatre", "Workshop", 45, "live"),
            ("Kalam Lit Quiz", "Kalam", 8, 15, 17, "Seminar Hall B", "Competition", 70, "published"),
            ("Drishti Street Play", "Drishti", 10, 17, 19, "Amphitheatre", "Performance", 150, "submitted"),
            ("Swara Open Mic", "Swara", 16, 16, 18, "Seminar Hall A", "Performance", 90, "submitted"),
            # Deliberate clash with Swara Open Mic: same venue, overlapping window.
            # The Dean's calendar is meant to have something to resolve.
            ("Natya Contemporary Workshop", "Natya", 16, 17, 19, "Seminar Hall A", "Workshop", 60, "submitted"),
            # Above the VC threshold, so it routes Society -> Dean -> VC.
            ("Culturals Night 2026", "Swara", 25, 17, 22, "Open Air Theatre", "Performance", 700, "submitted"),
        ]

        events = {}
        for title, club_name, offset, start_h, end_h, venue_name, template_name, expected, target in specs:
            club = clubs[club_name]
            venue = venues[venue_name]
            event = Event.objects.create(
                title=title, club=club, venue=venue, starts_at=at(offset, start_h),
                ends_at=at(offset, end_h), capacity=venue.capacity,
                expected_attendance=expected, status=EventStatus.DRAFT,
                kind=Event.Kind.PERFORMANCE,
            )
            seed_from_template(event, BudgetTemplate.objects.get(name=template_name))
            events[title] = (event, target, club_name)

        # ---- drive each event through the real approval chain ----------
        society_ctx, dean_ctx, vc_ctx = ctx_for(society), ctx_for(dean), ctx_for(vc)
        for title, (event, target, club_name) in events.items():
            president = club_officers[club_name]["president"]
            approval = governance.submit(event, actor=ctx_for(president.user),
                                        actor_user=president.user)
            if target == "submitted":
                continue
            # Approve through however many gates the route has, using the real
            # decide() path so the seeded history is a genuine approval trail.
            guard = 0
            while approval.state == ApprovalState.PENDING and guard < 4:
                guard += 1
                stage = approval.current_stage
                actor = {"cultural_society": society_ctx, "dean": dean_ctx, "vc": vc_ctx}[stage]
                sanctioned = None
                if stage == "dean":
                    # Trim one head, so the report shows sanctioned below requested.
                    lines = list(event.budget.lines.all())
                    sanctioned = {str(lines[0].id): lines[0].amount_requested * Decimal("0.9")}
                governance.decide(approval, ctx=actor, decision=Decision.APPROVE,
                                  sanctioned_lines=sanctioned)
                approval.refresh_from_db()
            event.refresh_from_db()
            if target == "live":
                event.status = EventStatus.LIVE
                event.save(update_fields=["status"])

        # ---- attendance, with deliberate overlap ----------------------
        attendance_plan = {
            "Swara Unplugged": (46, 38), "Natya Showcase": (58, 49),
            "Kalam Poetry Slam": (30, 25), "Lens Frames Exhibition": (34, 29),
            "Lens Heritage Photowalk": (38, 6), "Kalam Lit Quiz": (26, 0),
        }
        pool = students[:56]
        for title, (registered_n, attended_n) in attendance_plan.items():
            event, target, club_name = events[title]
            event.refresh_from_db()
            if event.status not in (EventStatus.PUBLISHED, EventStatus.LIVE,
                                    EventStatus.REPORTED, EventStatus.COMPLETED):
                continue
            was = event.status
            if was in (EventStatus.REPORTED, EventStatus.COMPLETED):
                # Registration is only open on a published or live event, which is
                # correct; the seed reopens briefly to backfill history.
                Event.objects.filter(pk=event.pk).update(status=EventStatus.PUBLISHED)
                event.refresh_from_db()
            chosen = rng.sample(pool, min(registered_n, len(pool)))
            operator = club_officers[club_name]["president"].user
            for index, student in enumerate(chosen):
                registration = participation.register_student(event, student)
                if index < attended_n:
                    token = participation.live_pass(registration).token
                    participation.resolve(token, event, operator=operator, station_id="GATE-1",
                                          scanned_at=event.starts_at + timedelta(minutes=5 + index))
            # A handful of forged and wrong-event scans, so capture rate is not a
            # meaningless 100% and the failure records have something to show.
            for _ in range(max(1, attended_n // 12)):
                participation.resolve("v1.k1.bm90YXJlYWx0b2tlbg.forged", event,
                                      operator=operator, station_id="GATE-1",
                                      scanned_at=event.starts_at + timedelta(minutes=9))
            Event.objects.filter(pk=event.pk).update(status=was)

        # ---- close the past events, with evidence ---------------------
        from events.services import close_event

        for title in ("Swara Unplugged", "Natya Showcase", "Kalam Poetry Slam",
                      "Lens Frames Exhibition"):
            event, _, club_name = events[title]
            event.refresh_from_db()
            if event.status in (EventStatus.PUBLISHED, EventStatus.LIVE):
                close_event(event, photo_count=rng.randint(6, 30),
                            social_links=["https://www.instagram.com/p/demo"],
                            actor=ctx_for(club_officers[club_name]["president"].user))

        # ---- settle one budget so the report shows spend --------------
        from budget.services import settle

        unplugged, _, _ = events["Swara Unplugged"]
        unplugged.refresh_from_db()
        budget = unplugged.budget
        from budget.services import attach_receipt

        for line in budget.lines.all():
            line.amount_spent = (line.amount_sanctioned or line.amount_requested) * Decimal("0.95")
            line.save(update_fields=["amount_spent"])
            # Lines above the receipt threshold need a document before the budget
            # will settle. The seed satisfies its own rule rather than bypassing
            # it, so the demo shows a settlement that actually passed the check.
            if line.amount_spent > settings.RECEIPT_THRESHOLD:
                attach_receipt(
                    line,
                    file_name=f"{line.head.lower().replace(' ', '-').replace('&', 'and')}.pdf",
                    content=f"Demo receipt for {line.head}".encode(),
                    content_type="application/pdf", amount=line.amount_spent,
                )
        try:
            settle(budget, actor=ctx_for(club_officers["Swara"]["treasurer"].user))
        except Exception as exc:                                  # noqa: BLE001
            self.stdout.write(self.style.WARNING(f"  budget not settled: {exc}"))

        swara = club_officers["Swara"]
        lens = club_officers["Lens"]
        self.stdout.write(self.style.SUCCESS("Seeded. Password for every account: " + PASSWORD))
        self.stdout.write("")
        self.stdout.write("  Student            " + students[40].user.email)
        self.stdout.write("  Swara president    " + swara["president"].user.email)
        self.stdout.write("  Swara treasurer    " + swara["treasurer"].user.email)
        self.stdout.write("  Lens president     " + lens["president"].user.email + "   (runs the live event)")
        self.stdout.write("  Cultural Society   cultural.secretary@college.edu")
        self.stdout.write("  Dean               dean@college.edu")
        self.stdout.write("  Vice-Chancellor    vc@college.edu")
        self.stdout.write("")
        self.stdout.write("  Staff accounts need any non-empty MFA code at login.")
