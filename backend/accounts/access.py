from django.db.models import Q

from .catalog import ROLE_PERMISSIONS
from .models import User


def role_of(user):
    return getattr(user, "normalized_role", user.role)


def is_super_admin(user):
    if not user:
        return False
    return role_of(user) == User.Role.SUPER_ADMIN or bool(user.is_superuser and role_of(user) in {User.Role.SUPER_ADMIN, User.Role.ADMIN})


def has_perm(user, code):
    if not user or not user.is_authenticated:
        return False
    if is_super_admin(user):
        return True
    denied = set(user.denied_permissions or [])
    if code in denied:
        return False
    extra = set(user.extra_permissions or [])
    if code in extra:
        return True
    return code in ROLE_PERMISSIONS.get(role_of(user), [])


def agency_of(user):
    return user.organization if user else None


def descendant_ids(user):
    ids = {user.id}
    queue = [user.id]
    while queue:
        kids = list(User.objects.filter(reports_to_id__in=queue).values_list("id", flat=True))
        queue = [kid for kid in kids if kid not in ids]
        ids.update(queue)
    return ids


def scoped_users(user):
    qs = User.objects.select_related("organization", "reports_to")
    if is_super_admin(user):
        return qs
    org = agency_of(user)
    if not org:
        return qs.filter(pk=user.pk)
    role = role_of(user)
    if role == User.Role.AGENCY:
        return qs.filter(organization=org)
    if role == User.Role.MANAGER:
        return qs.filter(Q(pk__in=descendant_ids(user)) | Q(pk=user.pk), organization=org)
    if role == User.Role.ADMIN:
        return qs.filter(Q(pk=user.pk) | Q(reports_to=user), organization=org)
    return qs.filter(pk=user.pk)


def scoped_campaigns(user, qs):
    if is_super_admin(user):
        return qs
    org = agency_of(user)
    if not org:
        return qs.none()
    qs = qs.filter(Q(agency=org) | Q(agency__isnull=True))
    role = role_of(user)
    if role == User.Role.AGENCY:
        return qs
    if role == User.Role.MANAGER:
        tree = descendant_ids(user)
        return qs.filter(Q(manager=user) | Q(admin_id__in=tree) | Q(created_by=user) | Q(assigned_users=user)).distinct()
    if role == User.Role.ADMIN:
        return qs.filter(Q(admin=user) | Q(created_by=user) | Q(assigned_users=user)).distinct()
    return qs.filter(Q(assigned_users=user) | Q(contacts__owner=user)).distinct()


def scoped_leads(user, qs):
    if is_super_admin(user):
        return qs
    org = agency_of(user)
    if not org:
        return qs.filter(owner=user)
    qs = qs.filter(Q(agency=org) | Q(agency__isnull=True))
    role = role_of(user)
    if role == User.Role.AGENCY:
        return qs.filter(agency=org)
    if role == User.Role.MANAGER:
        tree = descendant_ids(user)
        return qs.filter(
            Q(owner_id__in=tree)
            | Q(assigned_admin_id__in=tree)
            | Q(owner=user)
            | Q(campaign__manager=user)
            | Q(campaign__admin_id__in=tree)
        )
    if role == User.Role.ADMIN:
        return qs.filter(
            Q(assigned_admin=user)
            | Q(owner=user)
            | Q(owner__reports_to=user)
            | Q(campaign__admin=user)
            | Q(campaign__assigned_users=user)
        ).distinct()
    return qs.filter(Q(owner=user) | Q(campaign__assigned_users=user)).distinct()


def scoped_calls(user, qs):
    if is_super_admin(user):
        return qs
    org = agency_of(user)
    if org:
        qs = qs.filter(Q(agent__organization=org) | Q(campaign__agency=org))
    else:
        return qs.filter(agent=user)
    role = role_of(user)
    if role == User.Role.AGENCY:
        return qs
    tree = descendant_ids(user)
    if role == User.Role.MANAGER:
        return qs.filter(Q(agent_id__in=tree) | Q(agent=user) | Q(campaign__manager=user))
    if role == User.Role.ADMIN:
        return qs.filter(Q(agent_id__in=tree) | Q(agent=user) | Q(campaign__admin=user))
    return qs.filter(agent=user)


def require_perm(user, code):
    from rest_framework.exceptions import PermissionDenied

    if not has_perm(user, code):
        raise PermissionDenied("You do not have permission to perform this action.")
