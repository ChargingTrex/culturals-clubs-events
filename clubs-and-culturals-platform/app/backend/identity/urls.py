from django.urls import path

from identity import views

urlpatterns = [
    path("auth/mode", views.ModeView.as_view(), name="auth-mode"),
    path("auth/login", views.LoginView.as_view(), name="auth-login"),
    path("auth/refresh", views.RefreshView.as_view(), name="auth-refresh"),
    path("auth/logout", views.LogoutView.as_view(), name="auth-logout"),
    path("auth/me", views.MeView.as_view(), name="auth-me"),
    path("auth/preferences", views.PreferencesView.as_view(), name="auth-preferences"),
    path("directory/students", views.StudentLookupView.as_view(), name="directory-students"),
    path("semesters", views.SemesterView.as_view(), name="semesters"),
    # personas: PILOT_ACCOUNTS or DEMO_MODE; the passwordless login: DEMO_MODE only.
    path("auth/demo/personas", views.DemoPersonasView.as_view(), name="demo-personas"),
    path("auth/demo/<str:persona>", views.DemoLoginView.as_view(), name="demo-login"),
]
