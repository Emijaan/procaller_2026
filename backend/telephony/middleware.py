from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.authentication import JWTAuthentication


@database_sync_to_async
def user_from_token(token):
    if not token:
        return AnonymousUser()
    try:
        auth = JWTAuthentication()
        validated = auth.get_validated_token(token)
        return auth.get_user(validated)
    except Exception:
        return AnonymousUser()


class JwtAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        query = parse_qs(scope.get("query_string", b"").decode())
        token = (query.get("token") or [None])[0]
        headers = dict(scope.get("headers") or [])
        auth = headers.get(b"authorization", b"").decode()
        if auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1]
        scope["user"] = await user_from_token(token)
        return await super().__call__(scope, receive, send)
