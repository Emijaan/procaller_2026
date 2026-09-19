from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth.models import AnonymousUser


class AgentConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        if not user or isinstance(user, AnonymousUser) or not user.is_authenticated:
            await self.close(code=4401)
            return
        self.group_name = f"agent.{user.id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        await self.send_json({"type": "connected", "user_id": user.id})

    async def disconnect(self, code):
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive_json(self, content, **kwargs):
        msg_type = content.get("type")
        if msg_type == "heartbeat":
            await self._touch_session()
            await self.send_json({"type": "heartbeat.ok"})
            return
        if msg_type in {"webrtc.offer", "webrtc.answer", "webrtc.ice"}:
            target = content.get("target_user_id")
            if target:
                await self.channel_layer.group_send(
                    f"agent.{target}",
                    {
                        "type": "agent.event",
                        "payload": {
                            **content,
                            "from_user_id": self.scope["user"].id,
                        },
                    },
                )

    async def agent_event(self, event):
        await self.send_json(event["payload"])

    @database_sync_to_async
    def _touch_session(self):
        from django.utils import timezone

        from telephony.models import AgentSession

        AgentSession.objects.filter(user=self.scope["user"], ended_at__isnull=True).update(
            last_heartbeat=timezone.now()
        )
