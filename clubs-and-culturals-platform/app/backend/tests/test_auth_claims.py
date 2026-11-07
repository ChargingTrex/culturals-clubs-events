"""
The claim contract and the login flows.

Identity_Login_Shared_Data §5.4 calls the claim set "the fixed contract", and §5.2
says keeping it identical in both modes is what makes integration a configuration
change. A test that pins the shape is the only thing that keeps that true as the
module grows.
"""
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from common import roles as R
from identity import tokens
from identity.models import Status
from tests import factories as f

CONTRACT_CLAIMS = {
    "sub", "iss", "aud", "iat", "exp", "email", "student_id", "prn", "display_name",
    "roles", "department", "programme", "year", "mfa",
}


class ClaimContractTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.student = f.student("meera@college.edu", prn="23CS1001", name="Meera K")

    def test_access_token_carries_exactly_the_contract_claims(self):
        _, claims = tokens.access_token(self.student.user)
        self.assertTrue(CONTRACT_CLAIMS.issubset(claims), CONTRACT_CLAIMS - set(claims))

    def test_optional_claims_are_null_never_absent(self):
        """§5.4: 'Optional values are null, never omitted.'"""
        staff = f.user("dean@college.edu", global_roles=[R.DEAN], mfa=True)
        _, claims = tokens.access_token(staff)
        for key in ("student_id", "prn", "department", "programme", "year"):
            self.assertIn(key, claims, f"{key} was omitted rather than null")
            self.assertIsNone(claims[key])

    def test_full_name_is_deliberately_absent(self):
        """§5.4: display_name covers rendering; official name is fetched separately."""
        _, claims = tokens.access_token(self.student.user)
        self.assertNotIn("full_name", claims)

    def test_club_roles_travel_as_scoped_strings(self):
        club = f.club()
        f.member(club, self.student, R.CLUB_PRESIDENT)
        _, claims = tokens.access_token(self.student.user)
        self.assertIn(f"{R.CLUB_PRESIDENT}:{club.id}", claims["roles"])


class LoginTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.student = f.student("meera@college.edu", prn="23CS1001")
        self.dean = f.user("dean@college.edu", global_roles=[R.DEAN], mfa=True)

    def test_student_logs_in_without_mfa(self):
        response = self.client.post("/api/v1/module/auth/login",
                                    {"email": "meera@college.edu", "password": f.PASSWORD},
                                    format="json")
        self.assertEqual(response.status_code, 200)

    def test_staff_role_requires_mfa(self):
        """§5.5: MFA is mandatory for the Dean."""
        response = self.client.post("/api/v1/module/auth/login",
                                    {"email": "dean@college.edu", "password": f.PASSWORD},
                                    format="json")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["code"], "AUTH_MFA_REQUIRED")

    def test_mfa_claim_records_that_the_session_was_verified(self):
        response = self.client.post(
            "/api/v1/module/auth/login",
            {"email": "dean@college.edu", "password": f.PASSWORD, "mfa_code": "123456"},
            format="json")
        self.assertTrue(response.data["claims"]["mfa"])

    def test_wrong_password_does_not_reveal_whether_the_account_exists(self):
        known = self.client.post("/api/v1/module/auth/login",
                                 {"email": "meera@college.edu", "password": "wrong"},
                                 format="json")
        unknown = self.client.post("/api/v1/module/auth/login",
                                   {"email": "nobody@college.edu", "password": "wrong"},
                                   format="json")
        self.assertEqual(known.status_code, unknown.status_code)
        self.assertEqual(known.data["code"], unknown.data["code"])
        self.assertEqual(known.data["detail"], unknown.data["detail"])

    def test_suspended_account_cannot_log_in_but_keeps_its_records(self):
        """§3.5: the account is deactivated; the rows remain."""
        self.student.user.status = Status.SUSPENDED
        self.student.user.save()
        response = self.client.post("/api/v1/module/auth/login",
                                    {"email": "meera@college.edu", "password": f.PASSWORD},
                                    format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "AUTH_ACCOUNT_NOT_ACTIVE")
        self.assertTrue(self.student.__class__.objects.filter(pk=self.student.pk).exists())

    @override_settings(INTEGRATION_MODE="platform")
    def test_password_login_is_refused_in_platform_mode(self):
        """§5.2: in platform mode the login screen is the platform's."""
        response = self.client.post("/api/v1/module/auth/login",
                                    {"email": "meera@college.edu", "password": f.PASSWORD},
                                    format="json")
        self.assertEqual(response.data["code"], "AUTH_SSO_REQUIRED")


class RefreshRotationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.student = f.student("meera@college.edu", prn="23CS1001")

    def test_refresh_rotates_the_token(self):
        raw = tokens.issue_refresh(self.student.user)
        response = self.client.post("/api/v1/module/auth/refresh",
                                    {"refresh_token": raw}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(response.data["refresh_token"], raw)

    def test_reusing_a_consumed_refresh_token_revokes_the_family(self):
        """
        §5.3: 'reuse of a consumed refresh token revokes the family'. The
        legitimate holder also has a token in that family, so the only safe
        response is to invalidate all of them and force a fresh login.
        """
        raw = tokens.issue_refresh(self.student.user)
        second = self.client.post("/api/v1/module/auth/refresh",
                                  {"refresh_token": raw}, format="json").data["refresh_token"]
        replay = self.client.post("/api/v1/module/auth/refresh",
                                  {"refresh_token": raw}, format="json")
        self.assertEqual(replay.status_code, 401)
        after = self.client.post("/api/v1/module/auth/refresh",
                                 {"refresh_token": second}, format="json")
        self.assertEqual(after.status_code, 401, "the rest of the family should be revoked too")
