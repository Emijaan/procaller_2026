from accounts.access import role_of

from .models import Call, GsmPort, PortGroup

CALLING_ROLES = {"user", "agent"}
LIVE = ["initiating", "ringing", "connected", "on_hold"]


def agency_port_group(org):
    if not org:
        return None
    return PortGroup.objects.filter(agency=org, is_active=True).select_related("gateway").first()


def assign_user_port(user, port_id):
    if role_of(user) not in CALLING_ROLES:
        return None
    group = agency_port_group(user.organization)
    if not group:
        return None
    if not port_id:
        raise ValueError("Assign a GSM channel from this agency before creating the user")
    port = GsmPort.objects.filter(pk=port_id, group=group, is_active=True).first()
    if not port:
        raise ValueError("That GSM channel is not in this agency")
    if port.assigned_user_id and port.assigned_user_id != user.id:
        raise ValueError("That GSM channel is already assigned")
    GsmPort.objects.filter(assigned_user=user).exclude(pk=port.pk).update(assigned_user=None)
    port.assigned_user = user
    port.save(update_fields=["assigned_user"])
    return port


def port_for_user(user):
    group = agency_port_group(getattr(user, "organization", None))
    port = GsmPort.objects.filter(assigned_user=user, is_active=True).select_related("group").first()
    if group and (not port or port.group_id != group.id):
        raise ValueError("You must be assigned a GSM channel before calling")
    return port


def free_broadcast_port(campaign):
    group = agency_port_group(campaign.agency)
    if not group:
        return None
    busy = set(
        Call.objects.filter(gsm_port__group=group, state__in=LIVE).values_list("gsm_port_id", flat=True)
    )
    port = (
        GsmPort.objects.filter(group=group, is_active=True, assigned_user__isnull=False)
        .exclude(pk__in=busy)
        .select_related("assigned_user")
        .order_by("id")
        .first()
    )
    if not port:
        raise ValueError("No free GSM channel is assigned in this agency")
    return port


def dial_prefix_for(call):
    port = getattr(call, "gsm_port", None)
    if port is None and getattr(call, "gsm_port_id", None):
        port = GsmPort.objects.filter(pk=call.gsm_port_id).first()
    return (port.dial_prefix if port else "") or ""
