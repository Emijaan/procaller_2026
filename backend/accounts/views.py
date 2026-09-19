from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .serializers import EmailTokenObtainPairSerializer, UserSerializer


class LoginView(TokenObtainPairView):
    serializer_class = EmailTokenObtainPairSerializer


class RefreshView(TokenRefreshView):
    pass


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)
