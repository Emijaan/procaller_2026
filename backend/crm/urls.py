from django.urls import path

from .views import ContactDetailView, ContactListView, NextLeadView

urlpatterns = [
    path("contacts/", ContactListView.as_view(), name="contact-list"),
    path("contacts/<int:pk>/", ContactDetailView.as_view(), name="contact-detail"),
    path("leads/", ContactListView.as_view(), name="lead-list"),
    path("leads/next/", NextLeadView.as_view(), name="lead-next"),
    path("leads/<int:pk>/", ContactDetailView.as_view(), name="lead-detail"),
]
