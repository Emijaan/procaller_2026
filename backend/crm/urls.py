from django.urls import path

from .views import (
    ContactDetailView,
    ContactListView,
    LeadFileDetailView,
    LeadFileDownloadView,
    LeadFileListView,
    LookupLeadView,
    NextLeadView,
    ReleaseLeadView,
)

urlpatterns = [
    path("contacts/", ContactListView.as_view(), name="contact-list"),
    path("contacts/<int:pk>/", ContactDetailView.as_view(), name="contact-detail"),
    path("lead-files/", LeadFileListView.as_view(), name="lead-file-list"),
    path("lead-files/<int:pk>/", LeadFileDetailView.as_view(), name="lead-file-detail"),
    path("lead-files/<int:pk>/file/", LeadFileDownloadView.as_view(), name="lead-file-download"),
    path("leads/", ContactListView.as_view(), name="lead-list"),
    path("leads/lookup/", LookupLeadView.as_view(), name="lead-lookup"),
    path("leads/next/", NextLeadView.as_view(), name="lead-next"),
    path("leads/reserve/", NextLeadView.as_view(), name="lead-reserve"),
    path("leads/release/", ReleaseLeadView.as_view(), name="lead-release"),
    path("leads/<int:pk>/", ContactDetailView.as_view(), name="lead-detail"),
]
