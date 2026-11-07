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
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify

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

# Sai University's 21 clubs, from the SAIU wiki (chargingtrex.github.io/collage-wiki-SAIU/clubs).
# The first five carry the demo's members, events and budgets; keep them first and in
# this order, because officers are dealt from the student list in club order.
CLUBS = [
    ("Music Club", "Music", Club.Category.CULTURAL, "Harmonizing voices, bands, and acoustic instruments."),
    ("Dance Club", "Dance", Club.Category.CULTURAL, "Expressing rhythm, grace, and movement."),
    ("Literary Club", "Literary", Club.Category.LITERARY, "Celebrating the written and spoken word."),
    ("Photography Club", "Photography", Club.Category.CULTURAL, "Capturing moments through the lens."),
    ("Theatre Club", "Theatre", Club.Category.CULTURAL, "Bringing compelling stories to life on stage."),
    ("Art Club", "Visual arts", Club.Category.CULTURAL, "Unleashing creativity through visual arts."),
    ("Gardening Club", "Gardening", Club.Category.SOCIAL, "Cultivating green spaces across campus."),
    ("Astronomy Club", "Astronomy", Club.Category.TECHNICAL, "Exploring the cosmos & stargazing nights."),
    ("Gaming Club", "Gaming", Club.Category.SPORTS, "Casual, competitive, and esports community."),
    ("Oratory Club", "Public speaking", Club.Category.LITERARY, "Mastering public speaking, debate, and rhetoric."),
    ("Entrepreneurship Club", "Startups", Club.Category.TECHNICAL, "Fostering startup culture and business innovation."),
    ("Fashion Club", "Fashion", Club.Category.CULTURAL, "Setting trends, design, and celebrating style."),
    ("Science Society", "Science", Club.Category.TECHNICAL, "Advancing scientific curiosity and research."),
    ("Film Society", "Film", Club.Category.CULTURAL, "Appreciating, analyzing, and creating cinema."),
    ("Turingites", "Computer science", Club.Category.TECHNICAL, "Computer Science Society — coding, algorithms, hackathons."),
    ("Animal Welfare Society", "Animal welfare", Club.Category.SOCIAL, "Advocating, feeding, and caring for campus animals."),
    ("Martial Arts Club", "Martial arts", Club.Category.SPORTS, "Building discipline, fitness, and self-defense."),
    ("FOSS Club", "Open source", Club.Category.TECHNICAL, "Promoting Free and Open Source Software."),
    ("Chess Club", "Chess", Club.Category.SPORTS, "Strategy, tactics, and the quiet art of checkmate."),
    ("Pugwash Society", "Science policy", Club.Category.LITERARY, "Debating science, policy, and the world's hardest questions."),
    ("Sports Society", "Sports", Club.Category.SPORTS, "Home to the University Premier League — and everything played to win."),
]
# The two standing committees, from the SAIU wiki (…/collage-wiki-SAIU/committees).
# Held as clubs with the committee category so they get rosters, events and budgets.
COMMITTEES = [
    ("Cultural Society", "Committee", Club.Category.COMMITTEE,
     "Runs cultural events and performances across campus, and reviews proposals for new "
     "clubs in the Arts, Culture & Performing Arts category."),
    ("Student Government", "Committee", Club.Category.COMMITTEE,
     "The elected body representing the student community, running university-wide "
     "initiatives and events on behalf of students at large."),
]
CLUBS += COMMITTEES
DEMO_CLUBS = 5  # the clubs above that get full rosters, events and budgets
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
            name: Club.objects.create(name=name, slug=slugify(name), tag=tag, category=cat,
                                      description=description)
            for name, tag, cat, description in CLUBS
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
        for club in list(clubs.values())[:DEMO_CLUBS]:
            size = 8 if club.name != "Music Club" else 14
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

        # The other clubs and committees start with a President and Vice-President each, drawn from
        # students added here so the demo clubs' rosters and logins stay as they were.
        for offset, club in enumerate(list(clubs.values())[DEMO_CLUBS:]):
            for k, role in enumerate((R.CLUB_PRESIDENT, R.CLUB_VICE_PRESIDENT)):
                i = 64 + offset * 2 + k
                dept, programme = DEPTS[rng.randrange(len(DEPTS))]
                year = rng.randint(1, 4)
                name = f"{FIRST[i % len(FIRST)]} {LAST[rng.randrange(len(LAST))]}"
                prn = f"{26 - year}{dept[:2]}{1001 + i}"
                user = User.objects.create_user(
                    email=f"{prn.lower()}@college.edu", password=PASSWORD, full_name=name,
                    display_name=name.split()[0], global_roles=[R.STUDENT],
                )
                student = Student.objects.create(
                    user=user, prn=prn, full_name=name, department=dept, programme=programme,
                    year_of_study=year,
                )
                Membership.objects.create(club=club, student=student, role=role)

        # ---- events ---------------------------------------------------
        def at(days_from_today, hour, minute=0):
            # On the campus clock (C-02): a spec of 18 is 18:00 in India, not UTC.
            local = datetime.combine(today + timedelta(days=days_from_today),
                                     time(hour, minute))
            return timezone.make_aware(local, ZoneInfo(settings.DISPLAY_TIME_ZONE))

        specs = [
            # title, club, offset, start, end, venue, template, expected, status
            ("Unplugged Evening", "Music Club", -17, 18, 20, "Amphitheatre", "Performance", 120, "reported"),
            ("Dance Showcase", "Dance Club", -10, 17, 20, "Main Auditorium", "Performance", 250, "reported"),
            ("Annual Poetry Slam", "Literary Club", -7, 16, 18, "Seminar Hall B", "Competition", 60, "reported"),
            ("Frames Photo Exhibition", "Photography Club", -24, 10, 16, "Seminar Hall A", "Exhibition", 80, "reported"),
            ("Heritage Photowalk", "Photography Club", 0, 16, 18, "Open Air Theatre", "Workshop", 45, "live"),
            ("Literary Quiz", "Literary Club", 8, 15, 17, "Seminar Hall B", "Competition", 70, "published"),
            ("Street Play", "Theatre Club", 10, 17, 19, "Amphitheatre", "Performance", 150, "submitted"),
            ("Open Mic Night", "Music Club", 16, 16, 18, "Seminar Hall A", "Performance", 90, "submitted"),
            # Deliberate clash with Open Mic Night: same venue, overlapping window.
            # The Dean's calendar is meant to have something to resolve.
            ("Contemporary Dance Workshop", "Dance Club", 16, 17, 19, "Seminar Hall A", "Workshop", 60, "submitted"),
            # Above the VC threshold, so it routes Society -> Dean -> VC.
            ("Culturals Night 2026", "Music Club", 25, 17, 22, "Open Air Theatre", "Performance", 700, "submitted"),
            # One example of each review outcome, for the user guide.
            ("Carnatic Music Recital", "Music Club", 12, 17, 19, "Main Auditorium", "Performance", 200, "published"),
            ("Folk Fusion Evening", "Dance Club", 20, 17, 19, "Amphitheatre", "Performance", 150, "with_dean"),
            ("Late-Night Improv Marathon", "Theatre Club", 14, 20, 23, "Open Air Theatre", "Performance", 300, "rejected"),
            ("Short Film Screening", "Photography Club", 22, 17, 19, "Seminar Hall B", "Exhibition", 80, "edited"),
        ]

        # target: (stage where the approver stops, decision taken there, comment)
        outcomes = {
            "with_dean": ("dean", None, ""),
            "rejected": ("dean", Decision.REJECT,
                         "Runs past the 10 pm campus curfew and has no security plan for 300 people. "
                         "Not approved this semester."),
            "edited": ("dean", Decision.RETURN,
                       "Publicity looks high for an 80-seat screening, and the screening licence "
                       "is missing. Trim publicity and add the licence, then resubmit."),
        }

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
                if target in outcomes and stage == outcomes[target][0]:
                    _, decision, comment = outcomes[target]
                    if decision:
                        governance.decide(approval, ctx=actor, decision=decision, comment=comment)
                    break
                sanctioned = None
                if stage == "dean":
                    # Trim one head, so the report shows sanctioned below requested.
                    lines = list(event.budget.lines.all())
                    sanctioned = {str(lines[0].id): lines[0].amount_requested * Decimal("0.9")}
                governance.decide(approval, ctx=actor, decision=Decision.APPROVE,
                                  sanctioned_lines=sanctioned)
                approval.refresh_from_db()
            event.refresh_from_db()
            if target == "edited":
                # The club acts on the Dean's comment: trims publicity, adds the
                # licence, and resubmits — the trail shows the return, then a fresh request.
                budget = event.budget
                budget.lines.filter(head="Publicity").update(amount_requested=Decimal("600"))
                budget.lines.create(head="Screening licence", amount_requested=Decimal("2500"),
                                    position=budget.lines.count())
                officer = club_officers[club_name]["president"]
                governance.submit(event, actor=ctx_for(officer.user), actor_user=officer.user)
            if target == "live":
                event.status = EventStatus.LIVE
                event.save(update_fields=["status"])

        # ---- attendance, with deliberate overlap ----------------------
        attendance_plan = {
            "Unplugged Evening": (46, 38), "Dance Showcase": (58, 49),
            "Annual Poetry Slam": (30, 25), "Frames Photo Exhibition": (34, 29),
            "Heritage Photowalk": (38, 6), "Literary Quiz": (26, 0),
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

        for title in ("Unplugged Evening", "Dance Showcase", "Annual Poetry Slam",
                      "Frames Photo Exhibition"):
            event, _, club_name = events[title]
            event.refresh_from_db()
            if event.status in (EventStatus.PUBLISHED, EventStatus.LIVE):
                close_event(event, photo_count=rng.randint(6, 30),
                            social_links=["https://www.instagram.com/p/demo"],
                            actor=ctx_for(club_officers[club_name]["president"].user))

        # ---- settle one budget so the report shows spend --------------
        from budget.services import settle

        unplugged, _, _ = events["Unplugged Evening"]
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
            settle(budget, actor=ctx_for(club_officers["Music Club"]["treasurer"].user))
        except Exception as exc:                                  # noqa: BLE001
            self.stdout.write(self.style.WARNING(f"  budget not settled: {exc}"))

        music = club_officers["Music Club"]
        photo = club_officers["Photography Club"]
        self.stdout.write(self.style.SUCCESS("Seeded. Password for every account: " + PASSWORD))
        self.stdout.write("")
        self.stdout.write("  Student            " + students[40].user.email)
        self.stdout.write("  Music Club president      " + music["president"].user.email)
        self.stdout.write("  Music Club treasurer      " + music["treasurer"].user.email)
        self.stdout.write("  Photography Club pres.    " + photo["president"].user.email + "   (runs the live event)")
        self.stdout.write("  Cultural Society   cultural.secretary@college.edu")
        self.stdout.write("  Dean               dean@college.edu")
        self.stdout.write("  Vice-Chancellor    vc@college.edu")
        self.stdout.write("")
        self.stdout.write("  Staff accounts need any non-empty MFA code at login.")
