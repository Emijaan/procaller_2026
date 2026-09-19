from django.contrib import admin

from .models import Contact, FollowUp


@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = ("name", "phone", "company", "status", "campaign")
    search_fields = ("name", "phone", "company")


@admin.register(FollowUp)
class FollowUpAdmin(admin.ModelAdmin):
    list_display = ("contact", "agent", "due_at", "status")
