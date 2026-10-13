from django.http import HttpResponse
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.access import agency_of, is_super_admin

from .inbound import resolve_inbound
from .models import GsmGateway, GsmPort, PortGroup


def _port_payload(port):
    return {
        "id": port.id,
        "name": port.name,
        "dial_prefix": port.dial_prefix,
        "caller_id": port.caller_id,
        "is_active": port.is_active,
        "group": port.group_id,
        "group_name": port.group.name,
        "agency": port.group.agency_id,
        "assigned_user": port.assigned_user_id,
    }


class GatewayListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_super_admin(request.user):
            return Response({"detail": "Only Super Admin can manage GSM gateways"}, status=403)
        rows = [
            {"id": row.id, "name": row.name, "host": row.host, "sip_endpoint": row.sip_endpoint, "is_active": row.is_active}
            for row in GsmGateway.objects.all()
        ]
        return Response(rows)

    def post(self, request):
        if not is_super_admin(request.user):
            return Response({"detail": "Only Super Admin can manage GSM gateways"}, status=403)
        name = (request.data.get("name") or "").strip()
        host = (request.data.get("host") or "").strip()
        if not name or not host:
            return Response({"detail": "Gateway name and host are required"}, status=400)
        row = GsmGateway.objects.create(
            name=name,
            host=host,
            sip_endpoint=(request.data.get("sip_endpoint") or "gsm222").strip(),
        )
        return Response({"id": row.id, "name": row.name, "host": row.host, "sip_endpoint": row.sip_endpoint}, status=201)


class PortGroupListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not is_super_admin(request.user):
            return Response({"detail": "Only Super Admin can manage GSM gateways"}, status=403)
        rows = [
            {
                "id": row.id,
                "name": row.name,
                "gateway": row.gateway_id,
                "gateway_name": row.gateway.name,
                "agency": row.agency_id,
                "is_active": row.is_active,
            }
            for row in PortGroup.objects.select_related("gateway")
        ]
        return Response(rows)

    def post(self, request):
        if not is_super_admin(request.user):
            return Response({"detail": "Only Super Admin can manage GSM gateways"}, status=403)
        gateway = GsmGateway.objects.filter(pk=request.data.get("gateway"), is_active=True).first()
        name = (request.data.get("name") or "").strip()
        if not gateway or not name:
            return Response({"detail": "Choose a gateway and a group name"}, status=400)
        row = PortGroup.objects.create(gateway=gateway, name=name)
        return Response({"id": row.id, "name": row.name, "gateway": gateway.id}, status=201)


class GsmPortListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = GsmPort.objects.select_related("group", "assigned_user")
        if is_super_admin(request.user):
            agency = request.query_params.get("agency")
            if agency:
                qs = qs.filter(group__agency_id=agency)
        else:
            org = agency_of(request.user)
            qs = qs.filter(group__agency=org)
        return Response([_port_payload(row) for row in qs])

    def post(self, request):
        if not is_super_admin(request.user):
            return Response({"detail": "Only Super Admin can manage GSM gateways"}, status=403)
        group = PortGroup.objects.filter(pk=request.data.get("group"), is_active=True).first()
        name = (request.data.get("name") or "").strip()
        if not group or not name:
            return Response({"detail": "Choose a port group and a channel name"}, status=400)
        row = GsmPort.objects.create(
            group=group,
            name=name,
            dial_prefix=(request.data.get("dial_prefix") or "").strip(),
            caller_id=(request.data.get("caller_id") or "").strip(),
        )
        return Response(_port_payload(row), status=201)


class InboundRouteView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get(self, request):
        ip = request.META.get("REMOTE_ADDR") or ""
        if ip not in {"127.0.0.1", "::1"}:
            return HttpResponse("", status=403, content_type="text/plain")
        extension = resolve_inbound(request.query_params.get("caller"), request.query_params.get("did"))
        return HttpResponse(extension, content_type="text/plain")
