from django.contrib import admin

from identity.models import ReferenceCode, Semester, Student, User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ("display_name", "email", "status", "global_roles", "mfa_enabled")
    list_filter = ("status", "mfa_enabled")
    search_fields = ("email", "display_name", "full_name")


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ("prn", "full_name", "department", "programme", "year_of_study", "status")
    list_filter = ("department", "programme", "status")
    search_fields = ("prn", "full_name")


admin.site.register(ReferenceCode)
admin.site.register(Semester)
