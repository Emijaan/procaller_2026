from django.db.models import Q
from rest_framework.generics import ListAPIView, RetrieveAPIView

from .models import Contact
from .serializers import ContactSerializer


class ContactListView(ListAPIView):
    serializer_class = ContactSerializer

    def get_queryset(self):
        qs = Contact.objects.select_related("owner", "campaign")
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(phone__icontains=q) | Q(company__icontains=q))
        campaign = self.request.query_params.get("campaign")
        if campaign:
            qs = qs.filter(campaign_id=campaign)
        return qs


class ContactDetailView(RetrieveAPIView):
    serializer_class = ContactSerializer
    queryset = Contact.objects.select_related("owner", "campaign")
