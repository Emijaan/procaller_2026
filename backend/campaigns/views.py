from rest_framework.generics import ListAPIView

from .models import Campaign
from .serializers import CampaignSerializer


class CampaignListView(ListAPIView):
    serializer_class = CampaignSerializer
    queryset = Campaign.objects.filter(active=True)
