from django.urls import path

from .views import ContactDetailView, ContactListView

urlpatterns = [
    path("contacts/", ContactListView.as_view(), name="contact-list"),
    path("contacts/<int:pk>/", ContactDetailView.as_view(), name="contact-detail"),
]
