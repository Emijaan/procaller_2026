from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import Organization, User


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ("name", "product_name", "timezone")


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("email", "display_name", "role", "extension", "presence")
    ordering = ("email",)
    fieldsets = BaseUserAdmin.fieldsets + (
        ("ProCaller", {"fields": ("role", "team", "extension", "sip_username", "sip_password", "presence", "avatar_initials", "organization")}),
    )
