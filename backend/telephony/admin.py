from django.contrib import admin

from .models import AgentSession, Call


@admin.register(AgentSession)
class AgentSessionAdmin(admin.ModelAdmin):
    list_display = ("user", "status", "room_id", "started_at", "ended_at")


@admin.register(Call)
class CallAdmin(admin.ModelAdmin):
    list_display = ("id", "phone_number", "agent", "state", "disposition", "started_at")
    list_filter = ("state", "disposition", "direction")
    search_fields = ("phone_number", "callerid_token")
