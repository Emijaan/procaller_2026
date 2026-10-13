from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .access import ROLE_RANK, agency_of, has_perm, is_super_admin, role_of, role_rank, scoped_campaigns, scoped_users
from .models import AuditLog, Organization, User


CALLING_ROLES = {User.Role.USER, User.Role.AGENT}


def campaign_ids_from_payload(data):
    if data is None:
        return None
    raw = data.get("campaigns")
    if raw is None:
        raw = data.get("campaign_ids")
    if raw is None and data.get("campaign") not in (None, ""):
        raw = [data.get("campaign")]
    if raw is None:
        return None
    if not isinstance(raw, (list, tuple)):
        raw = [raw]
    ids = []
    for item in raw:
        try:
            ids.append(int(item))
        except (TypeError, ValueError):
            continue
    return ids


def resolve_staff_campaigns(actor, user, campaign_ids):
    from campaigns.models import Campaign

    ids = list(dict.fromkeys(campaign_ids or []))
    if not ids:
        return []
    qs = scoped_campaigns(actor, Campaign.objects.filter(pk__in=ids))
    if getattr(user, "organization_id", None):
        qs = qs.filter(agency_id=user.organization_id)
    found = list(qs)
    if len(found) != len(ids):
        raise ValueError("One or more campaigns are invalid for this user")
    return found


def assign_staff_campaigns(actor, user, campaign_ids, *, required=False):
    campaigns = resolve_staff_campaigns(actor, user, campaign_ids)
    if required and not campaigns:
        raise ValueError("Users must be assigned to a campaign before they can call")
    user.assigned_campaigns.set(campaigns)
    return campaigns


def write_audit(user, action, object_type="", object_id="", request=None, metadata=None):
    ip = None
    if request:
        ip = request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip() or request.META.get("REMOTE_ADDR")
    AuditLog.objects.create(
        user=user if getattr(user, "is_authenticated", False) else None,
        agency=agency_of(user) if user else None,
        action=action,
        object_type=object_type,
        object_id=str(object_id or ""),
        ip_address=ip,
        metadata=metadata or {},
    )


def _count_role(org, role):
    roles = [role]
    if role == User.Role.MANAGER:
        roles.append(User.Role.SUPERVISOR)
    if role == User.Role.USER:
        roles.append(User.Role.AGENT)
    return User.objects.filter(organization=org, role__in=roles, is_active=True).count()


def assert_agency_limits(org, role):
    if not org:
        raise ValueError("Agency is required")
    if role == User.Role.MANAGER and _count_role(org, User.Role.MANAGER) >= org.max_managers:
        raise ValueError(f"Manager limit reached ({org.max_managers}/{org.max_managers})")
    if role == User.Role.ADMIN and _count_role(org, User.Role.ADMIN) >= org.max_admins:
        raise ValueError(f"Admin limit reached ({org.max_admins}/{org.max_admins})")
    if role == User.Role.USER and _count_role(org, User.Role.USER) >= org.max_users:
        raise ValueError(f"User limit reached ({org.max_users}/{org.max_users})")


def assert_manager_limits(manager, role):
    if not manager:
        return
    if role == User.Role.ADMIN:
        used = User.objects.filter(reports_to=manager, role=User.Role.ADMIN, is_active=True).count()
        if used >= manager.max_admins:
            raise ValueError(f"Admin limit reached ({manager.max_admins}/{manager.max_admins})")
    if role == User.Role.USER:
        used = User.objects.filter(
            Q(reports_to=manager) | Q(reports_to__reports_to=manager),
            role__in=[User.Role.USER, User.Role.AGENT],
            is_active=True,
        ).count()
        if used >= manager.max_users:
            raise ValueError(f"User limit reached ({manager.max_users}/{manager.max_users})")


@transaction.atomic
def create_account(actor, *, email, password, role, organization=None, reports_to=None, **extra):
    role = role or User.Role.USER
    if role == User.Role.SUPER_ADMIN and not is_super_admin(actor):
        raise ValueError("Only Super Admin can create Super Admins")
    if role == User.Role.AGENCY and not has_perm(actor, "create_agency"):
        raise ValueError("Not allowed to create agencies")
    if not is_super_admin(actor) and ROLE_RANK.get(role, 0) >= role_rank(actor):
        raise ValueError("Cannot create an account at or above your level")
    org = organization
    if role != User.Role.SUPER_ADMIN:
        own = agency_of(actor)
        if not is_super_admin(actor):
            if organization and own and organization.id != own.id:
                raise ValueError("Cannot create accounts in another agency")
            org = own
        else:
            org = organization or own
        if reports_to and org and reports_to.organization_id != org.id:
            raise ValueError("Manager must belong to the same agency")
        if reports_to and not is_super_admin(actor) and not scoped_users(actor).filter(pk=reports_to.pk).exists():
            raise ValueError("Cannot assign a manager outside your agency")
        if role != User.Role.AGENCY:
            assert_agency_limits(org, role)
        if not reports_to and role_of(actor) in (User.Role.AGENCY, User.Role.MANAGER, User.Role.ADMIN) and role != User.Role.AGENCY:
            reports_to = actor
        manager = reports_to if reports_to and role_of(reports_to) == User.Role.MANAGER else None
        if not manager and reports_to and role_of(reports_to) == User.Role.ADMIN:
            manager = reports_to.reports_to if reports_to.reports_to and role_of(reports_to.reports_to) == User.Role.MANAGER else None
        if manager:
            assert_manager_limits(manager, role)
    extra.pop("extension", None)
    extra.pop("sip_username", None)
    extra.pop("sip_password", None)
    extra.pop("pc_number", None)
    user = User(
        email=email,
        username=email,
        role=role,
        organization=org,
        reports_to=reports_to,
        **extra,
    )
    user.set_password(password or User.objects.make_random_password())
    user.save()
    from telephony.sip_provision import ensure_sip_identity

    ensure_sip_identity(user)
    return user


def require_calling_campaigns(role, campaign_ids):
    if role in CALLING_ROLES and not campaign_ids:
        raise ValueError("Users must be assigned to a campaign before they can call")


def guard_staff_write(actor, target, data):
    """Keep staff edits inside the actor's agency and below their role."""
    if is_super_admin(actor):
        org = data.get("organization") or target.organization
        reports_to = data.get("reports_to")
        if reports_to and org and reports_to.organization_id != org.id:
            raise ValueError("Manager must belong to the same agency")
        return data
    own = agency_of(actor)
    if not own or target.organization_id != own.id:
        raise ValueError("Cannot edit an account in another agency")
    if data.get("organization") and data["organization"].id != own.id:
        raise ValueError("Cannot move an account to another agency")
    data["organization"] = own
    reports_to = data.get("reports_to")
    if reports_to and (
        reports_to.organization_id != own.id or not scoped_users(actor).filter(pk=reports_to.pk).exists()
    ):
        raise ValueError("Cannot assign a manager outside your agency")
    new_role = data.get("role")
    if new_role and ROLE_RANK.get(new_role, 0) >= role_rank(actor):
        raise ValueError("Cannot assign a role at or above your level")
    data.pop("extra_permissions", None)
    data.pop("denied_permissions", None)
    return data


def usage_for_agency(org):
    return {
        "managers": _count_role(org, User.Role.MANAGER),
        "max_managers": org.max_managers,
        "admins": _count_role(org, User.Role.ADMIN),
        "max_admins": org.max_admins,
        "users": _count_role(org, User.Role.USER),
        "max_users": org.max_users,
    }
