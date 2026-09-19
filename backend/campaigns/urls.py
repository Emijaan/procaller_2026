from django.urls import path

from .views import (
    CampaignDetailView,
    CampaignHoldAudioView,
    CampaignImportConfirmView,
    CampaignImportPreviewView,
    CampaignLeadListView,
    CampaignListCreateView,
)

urlpatterns = [
    path("campaigns/", CampaignListCreateView.as_view(), name="campaign-list"),
    path("campaigns/<int:pk>/", CampaignDetailView.as_view(), name="campaign-detail"),
    path("campaigns/<int:pk>/hold-audio/", CampaignHoldAudioView.as_view(), name="campaign-hold-audio"),
    path("campaigns/<int:pk>/import/preview/", CampaignImportPreviewView.as_view(), name="campaign-import-preview"),
    path("campaigns/<int:pk>/import/", CampaignImportConfirmView.as_view(), name="campaign-import"),
    path("campaigns/<int:pk>/leads/", CampaignLeadListView.as_view(), name="campaign-leads"),
]
