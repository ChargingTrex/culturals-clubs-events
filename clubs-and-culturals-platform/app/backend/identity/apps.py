from django.apps import AppConfig


class IdentityConfig(AppConfig):
    name = "identity"

    def ready(self):
        # Registers the OpenAPI security scheme for ClaimsAuthentication; the
        # generator only sees extensions that have been imported.
        from identity import schema  # noqa: F401
