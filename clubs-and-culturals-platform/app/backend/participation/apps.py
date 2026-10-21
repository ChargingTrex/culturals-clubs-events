from django.apps import AppConfig


class ParticipationConfig(AppConfig):
    name = "participation"

    def ready(self):
        # Registers the Event save hooks that tell registered students about
        # publication and venue moves (PRD 5.16.3) without governance or events
        # having to know this app exists.
        from participation import signals  # noqa: F401
