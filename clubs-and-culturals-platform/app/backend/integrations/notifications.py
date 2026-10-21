from django.conf import settings
from django.core.mail import send_mail

from integrations.base import NotificationSender


class LocalNotificationSender(NotificationSender):
    """
    Standalone mode: direct SMTP plus this module's own in-app table (§2.2).

    In-app and email only. AGENT_PROMPT §2 rules out SMS, WhatsApp and every
    third-party messaging channel, and rule 7 of the platform prompt forbids
    building a second channel at all.
    """

    def send(self, *, recipient, subject, body, kind, link=None):
        from governance.models import Notification

        note = Notification.objects.create(
            user=recipient, subject=subject, body=body, kind=kind, link=link or ""
        )
        # §3.3: system mail goes to the institutional address while the account
        # is active; personal_email is a fallback for alumni, never for login.
        address = recipient.email
        if address:
            send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [address], fail_silently=True)
        return note


class PlatformNotificationSender(NotificationSender):
    """Platform mode: post to the core notification service (§2.2)."""

    def __init__(self, base_url=None):
        self.base_url = base_url

    def send(self, *, recipient, subject, body, kind, link=None):
        raise NotImplementedError(
            "PlatformNotificationSender requires /api/v1/core/notifications."
        )
