"""Read-only SQL against the backend's database, so a suite can check what was stored, not only what the API said.

Django keeps UUID primary and foreign keys in SQLite as 32 hex characters, so match an API id against
them with `replace(?, '-', '')`; audit `target_id` and notification links keep the dashes.

shortcut: SQLite only (the local e2e run); add a psycopg branch when the suites run against Postgres.
"""
import os
import sqlite3

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "..", "..", "backend", "db.sqlite3"))


def query(sql, *params):
    """Every row, as dicts."""
    with sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True) as conn:
        conn.row_factory = sqlite3.Row
        return [dict(r) for r in conn.execute(sql, params)]


def row(sql, *params):
    """Exactly one row, or fail."""
    rows = query(sql, *params)
    if len(rows) != 1:
        raise AssertionError(f"expected one row, got {len(rows)}: {sql} {params}")
    return rows[0]


def tables():
    """Every table name in the file, sorted."""
    return sorted(r["name"] for r in query("select name from sqlite_master where type = 'table'"))


def scalar(sql, *params):
    """The first column of the single row."""
    r = row(sql, *params)
    return next(iter(r.values()))


def as_utc(value):
    """A stored or API datetime as an aware UTC datetime. Django writes SQLite datetimes as naive UTC text."""
    from datetime import datetime, timezone

    dt = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def same_instant(a, b):
    """True when two datetimes (text or objects, any zone) name the same moment."""
    return as_utc(a) == as_utc(b)
