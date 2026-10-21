from integrations.base import StudentDirectory


class LocalStudentDirectory(StudentDirectory):
    """
    Standalone mode: a CSV-imported, read-only student table in this module
    (§2.2). Read-only is the point — AGENT_PROMPT §3.4 forbids writing portal
    core tables, and the local mirror keeps that habit true from day one.
    """

    def _qs(self):
        from identity.models import Student

        return Student.objects.all()

    def get(self, student_id):
        return self._qs().filter(pk=student_id).first()

    def by_prn(self, prn):
        # §3.4: trim and upper-case on input so a desk operator typing lower
        # case still matches a canonically-stored PRN.
        return self._qs().filter(prn=(prn or "").strip().upper()).first()

    def search(self, query, limit=10):
        from django.db.models import Q

        q = (query or "").strip()
        if len(q) < 2:
            return []
        return list(
            self._qs().filter(Q(prn__icontains=q) | Q(full_name__icontains=q))[:limit]
        )


class PlatformStudentDirectory(StudentDirectory):
    """
    Platform mode: read the platform SIS over /api/v1/sis/ (§3.1).

    Deliberately unimplemented until the platform exists. It raises rather than
    silently returning None, because a directory that quietly finds nobody looks
    identical to a student who is not enrolled, and that would mark real
    attendees absent.
    """

    def __init__(self, base_url=None, token_supplier=None):
        self.base_url = base_url
        self.token_supplier = token_supplier

    def _unimplemented(self):
        raise NotImplementedError(
            "PlatformStudentDirectory requires the platform SIS. "
            "Run with INTEGRATION_MODE=local until /api/v1/sis/ is available."
        )

    def get(self, student_id):
        self._unimplemented()

    def by_prn(self, prn):
        self._unimplemented()

    def search(self, query, limit=10):
        self._unimplemented()
