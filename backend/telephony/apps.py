import sys

from django.apps import AppConfig


class TelephonyConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "telephony"

    def ready(self):
        if any(cmd in sys.argv for cmd in ("migrate", "makemigrations", "collectstatic", "seed_demo", "shell", "test")):
            return
        from .ami import start_listener
        from .ari_client import start_event_listener

        start_listener()
        start_event_listener()
