"""
Interfaces the platform will eventually provide.

API_Standards_Integration_Contract §2.1 — the standalone-first principle. Each
interface ships two implementations, chosen by INTEGRATION_MODE. The module's
own data (clubs, events, registrations, budgets, photos) never moves between
modes; only these shared concerns switch.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Claims:
    """
    The fixed claim contract, Identity_Login_Shared_Data §5.4.

    Every field is present in both modes; optional values are None, never
    absent. `full_name` is deliberately not here — display_name covers
    rendering and the official name is fetched only where legally needed.
    """

    sub: str
    email: str
    student_id: str | None = None
    prn: str | None = None
    display_name: str = ""
    roles: tuple = ()
    department: str | None = None
    programme: str | None = None
    year: int | None = None
    mfa: bool = False
    iss: str = ""
    aud: tuple = ()
    extra: dict = field(default_factory=dict)


class IdentityProvider(ABC):
    """Turns a bearer credential into Claims, and issues them in local mode."""

    @abstractmethod
    def authenticate(self, raw_token: str) -> Claims:
        ...


class StudentDirectory(ABC):
    """Read-only student lookup. Portal core tables are never written (§3.4)."""

    @abstractmethod
    def get(self, student_id): ...

    @abstractmethod
    def by_prn(self, prn): ...

    @abstractmethod
    def search(self, query, limit=10): ...


class NotificationSender(ABC):
    """In-app and email only. No SMS, no WhatsApp, ever (AGENT_PROMPT §2)."""

    @abstractmethod
    def send(self, *, recipient, subject, body, kind, link=None): ...


class FileStore(ABC):
    """DB stores references only, never binary (AGENT_PROMPT §2)."""

    @abstractmethod
    def put(self, *, key, content, content_type): ...

    @abstractmethod
    def url_for(self, key): ...


class AuditSink(ABC):
    @abstractmethod
    def record(self, *, actor, action, target, before=None, after=None, reason=""): ...
