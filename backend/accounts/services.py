from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .access import agency_of, has_perm, is_super_admin, role_of
from .models import AuditLog, Organization, User


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
    org = organization
    if role != User.Role.SUPER_ADMIN:
        org = organization or agency_of(actor)
        if role != User.Role.AGENCY:
            assert_agency_limits(org, role)
        if not reports_to and role_of(actor) in (User.Role.AGENCY, User.Role.MANAGER, User.Role.ADMIN) and role != User.Role.AGENCY:
            reports_to = actor
        manager = reports_to if reports_to and role_of(reports_to) == User.Role.MANAGER else None
        if not manager and reports_to and role_of(reports_to) == User.Role.ADMIN:
            manager = reports_to.reports_to if reports_to.reports_to and role_of(reports_to.reports_to) == User.Role.MANAGER else None
        if manager:
            assert_manager_limits(manager, role)
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
    return user


def usage_for_agency(org):
    return {
        "managers": _count_role(org, User.Role.MANAGER),
        "max_managers": org.max_managers,
        "admins": _count_role(org, User.Role.ADMIN),
        "max_admins": org.max_admins,
        "users": _count_role(org, User.Role.USER),
        "max_users": org.max_users,
    }
