import os

from channels.routing import ProtocolTypeRouter, URLRouter
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "procaller.settings")
django_asgi_app = get_asgi_application()

from telephony.middleware import JwtAuthMiddleware
from telephony.routing import websocket_urlpatterns

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": JwtAuthMiddleware(URLRouter(websocket_urlpatterns)),
    }
)
