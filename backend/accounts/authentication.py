from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken


class EpochJWTAuthentication(JWTAuthentication):
    """Reject tokens issued before a supervisor forced this user to log out."""

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        claim = int(validated_token.get("epoch") or 0)
        if claim != int(getattr(user, "auth_epoch", 0) or 0):
            raise InvalidToken("Session ended by a supervisor")
        return user
