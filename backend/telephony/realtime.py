from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer


def broadcast_user(user_id, payload):
    layer = get_channel_layer()
    if not layer:
        return
    async_to_sync(layer.group_send)(f"agent.{user_id}", {"type": "agent.event", "payload": payload})


def broadcast_call(call, event_type, extra=None):
    from .serializers import CallSerializer

    payload = {"type": event_type, "call": CallSerializer(call).data}
    if extra:
        payload.update(extra)
    broadcast_user(call.agent_id, payload)
