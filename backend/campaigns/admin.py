from django.contrib import admin

from .models import Campaign


@admin.register(Campaign)
class CampaignAdmin(admin.ModelAdmin):
    list_display = ("name", "status", "dial_method", "active")
