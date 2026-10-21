"""
drf-spectacular registration for the module's authenticator.

ClaimsAuthentication is a plain bearer scheme from the client's point of view,
whichever provider validates the token (identity/authentication.py). Without
this extension the generator cannot tell, and every protected route is
documented as open. Imported from IdentityConfig.ready().
"""
from drf_spectacular.extensions import OpenApiAuthenticationExtension


class ClaimsAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = "identity.authentication.ClaimsAuthentication"
    name = "bearerAuth"

    def get_security_definition(self, auto_schema):
        return {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": ("Access token from `POST /module/auth/login` (standalone mode) "
                            "or the platform's SSO (platform mode)."),
        }
