from integrations.base import AuditSink


class LocalAuditSink(AuditSink):
    """Standalone mode: the module's own audit table (§2.2)."""

    def record(self, *, actor, action, target, before=None, after=None, reason=""):
        from governance.models import AuditEntry

        return AuditEntry.objects.create(
            actor_sub=getattr(actor, "sub", "") or "",
            actor_label=getattr(actor, "display_name", "") or "",
            action=action,
            target_type=target.__class__.__name__ if target is not None else "",
            target_id=str(getattr(target, "pk", "") or ""),
            before=before or {},
            after=after or {},
            reason=reason,
        )


class PlatformAuditSink(LocalAuditSink):
    """
    Platform mode: write locally AND mirror to the platform audit (§2.2).

    Local-first is deliberate. If the mirror fails the module still holds the
    record, and an audit trail that can be lost by a network error is not one.
    """

    def record(self, *, actor, action, target, before=None, after=None, reason=""):
        entry = super().record(actor=actor, action=action, target=target,
                               before=before, after=after, reason=reason)
        # TODO(platform): POST to /api/v1/core/audit, retried via Celery.
        return entry
