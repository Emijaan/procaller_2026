from django.urls import path

from .views import CampaignListView

urlpatterns = [
    path("campaigns/", CampaignListView.as_view(), name="campaign-list"),
]
