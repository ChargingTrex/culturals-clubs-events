"""
Venue booking integrity in the database (AGENT_PROMPT §3 rule 3, §4).

An application-level clash check loses under concurrency; a constraint does
not. PostgreSQL enforces that no two confirmed bookings of one venue overlap:

    EXCLUDE USING gist (venue_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&)
    WHERE (status IN ('approved','published','live','completed','reported'))

Scoped to the confirmed statuses because a `submitted` request may legitimately
overlap another (the Dean decides who gets Friday — events/services.py
soft_clashes); only a settled booking must never be double-held. The 30-minute
set-up buffer (VENUE_BUFFER_MINUTES) is a setting, not a column, so the
constraint is the floor — no literal overlap — and the application applies the
buffer on top under a `select_for_update` on the venue row.

Vendor-guarded: SQLite has neither GiST nor range types, so there the migration
is a no-op and the locked application check is all there is (settings.py says as
much). The model's Meta does not declare the constraint, so `makemigrations
--check` stays clean on both vendors.
"""
from django.db import migrations

CONSTRAINT_NAME = "venue_confirmed_bookings_do_not_overlap"
CONFIRMED = ("approved", "published", "live", "completed", "reported")


def _is_postgres(schema_editor):
    return schema_editor.connection.vendor == "postgresql"


def add_constraint(apps, schema_editor):
    if not _is_postgres(schema_editor):
        return
    from django.contrib.postgres.constraints import ExclusionConstraint
    from django.contrib.postgres.fields import DateTimeRangeField, RangeBoundary, RangeOperators
    from django.db.models import Func, Q

    class TsTzRange(Func):
        function = "TSTZRANGE"
        output_field = DateTimeRangeField()

    Event = apps.get_model("events", "Event")
    constraint = ExclusionConstraint(
        name=CONSTRAINT_NAME,
        expressions=[
            ("venue", RangeOperators.EQUAL),
            (TsTzRange("starts_at", "ends_at", RangeBoundary()), RangeOperators.OVERLAPS),
        ],
        condition=Q(status__in=CONFIRMED),
    )
    # btree_gist lets `=` on a uuid column share the GiST index with `&&` on the
    # range. Trusted extension since PostgreSQL 13, so no superuser is needed.
    schema_editor.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    schema_editor.add_constraint(Event, constraint)


def remove_constraint(apps, schema_editor):
    if not _is_postgres(schema_editor):
        return
    schema_editor.execute(
        f'ALTER TABLE "{apps.get_model("events", "Event")._meta.db_table}" '
        f'DROP CONSTRAINT IF EXISTS "{CONSTRAINT_NAME}"'
    )


class Migration(migrations.Migration):

    dependencies = [
        ("events", "0003_eventorganiser"),
    ]

    operations = [
        migrations.RunPython(add_constraint, remove_constraint),
    ]
