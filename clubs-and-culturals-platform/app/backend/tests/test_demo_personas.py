"""
The pilot accounts on the sign-in page.

In demo mode the persona list carries each account's email, the shared demo
password and whether it needs a second factor, so the sign-in page can fill the
form. Signing in with those still goes through the real login — staff still
have to give a code. With demo mode off the list does not exist at all.
"""
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from common import roles as R
from identity.management.commands.seed_demo import PASSWORD as DEMO_PASSWORD
from identity.models import Student, User

URL = "/api/v1/module/auth/demo/personas"


def make_user(email, roles):
    return User.objects.create_user(email=email, password=DEMO_PASSWORD, full_name=email,
                                    display_name=email.split("@")[0], global_roles=roles)


@override_settings(DEMO_MODE=True, DEBUG=True)
class PilotAccountsTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.dean = make_user("dean@college.edu", [R.DEAN])
        student_user = make_user("25la1001@college.edu", [R.STUDENT])
        Student.objects.create(user=student_user, prn="25LA1001", full_name="Nithya",
                               department="LAW", programme="BA-LLB", year_of_study=1)

    def personas(self):
        response = self.client.get(URL)
        self.assertEqual(response.status_code, 200)
        return {p["key"]: p for p in response.data["personas"]}

    def test_each_account_comes_with_its_email_password_and_second_factor_rule(self):
        p = self.personas()
        self.assertEqual(p["dean"]["email"], "dean@college.edu")
        self.assertEqual(p["dean"]["password"], DEMO_PASSWORD)
        self.assertTrue(p["dean"]["mfa_required"])
        self.assertEqual(p["student"]["email"], "25la1001@college.edu")
        self.assertFalse(p["student"]["mfa_required"])

    def test_a_persona_with_no_account_lists_nothing_to_sign_in_with(self):
        p = self.personas()
        self.assertFalse(p["vc"]["available"])
        self.assertIsNone(p["vc"]["email"])
        self.assertIsNone(p["vc"]["password"])

    def test_the_listed_credentials_sign_in_through_the_real_login(self):
        p = self.personas()["student"]
        response = self.client.post("/api/v1/module/auth/login",
                                    {"email": p["email"], "password": p["password"]},
                                    format="json")
        self.assertEqual(response.status_code, 200)

    def test_a_staff_account_still_needs_its_second_factor(self):
        p = self.personas()["dean"]
        response = self.client.post("/api/v1/module/auth/login",
                                    {"email": p["email"], "password": p["password"]},
                                    format="json")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["code"], "AUTH_MFA_REQUIRED")


@override_settings(DEMO_MODE=False)
class PilotAccountsOffTests(TestCase):
    def test_outside_demo_mode_there_is_no_account_list(self):
        response = APIClient().get(URL)
        self.assertEqual(response.status_code, 404)
