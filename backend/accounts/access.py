from django.db.models import Q

from .catalog import ROLE_PERMISSIONS
from .models import User


ROLE_RANK = {
    User.Role.USER: 10,
    User.Role.AGENT: 10,
    User.Role.ADMIN: 20,
    User.Role.MANAGER: 30,
    User.Role.SUPERVISOR: 30,
    User.Role.AGENCY: 40,
    User.Role.SUPER_ADMIN: 50,
}


def role_of(user):
    return getattr(user, "normalized_role", user.role)


def role_rank(user):
    if not user:
        return 0
    if is_super_admin(user):
        return ROLE_RANK[User.Role.SUPER_ADMIN]
    return ROLE_RANK.get(role_of(user), 0)


def is_strictly_below(actor, target):
    if not actor or not target or actor.pk == target.pk:
        return False
    return role_rank(target) < role_rank(actor)


def is_super_admin(user):
    if not user:
        return False
    return role_of(user) == User.Role.SUPER_ADMIN or bool(user.is_superuser and role_of(user) in {User.Role.SUPER_ADMIN, User.Role.ADMIN})


def staff_manage_code(role):
    role = role or User.Role.USER
    if role in {User.Role.SUPERVISOR, User.Role.MANAGER}:
        return "manage_manager"
    if role == User.Role.ADMIN:
        return "manage_admin"
    if role == User.Role.AGENCY:
        return "manage_agency"
    if role == User.Role.SUPER_ADMIN:
        return "create_agency"
    return "manage_user"


def staff_create_code(role):
    role = role or User.Role.USER
    if role in {User.Role.SUPERVISOR, User.Role.MANAGER}:
        return "create_manager"
    if role == User.Role.ADMIN:
        return "create_admin"
    if role in {User.Role.AGENCY, User.Role.SUPER_ADMIN}:
        return "create_agency"
    return "create_user"


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
        if code == "create_agency":
            return False
        return True
    return code in ROLE_PERMISSIONS.get(role_of(user), [])


def agency_of(user):
    return user.organization if user else None


def descendant_ids(user):
    """Users who report up to this user, staying inside the same agency."""
    ids = {user.id}
    queue = [user.id]
    org_id = getattr(user, "organization_id", None)
    while queue:
        kids = User.objects.filter(reports_to_id__in=queue)
        if org_id:
            kids = kids.filter(organization_id=org_id)
        kids = [kid for kid in kids.values_list("id", flat=True) if kid not in ids]
        queue = kids
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
        return qs.filter(organization=org).exclude(Q(role=User.Role.SUPER_ADMIN) | Q(is_superuser=True))
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
    qs = qs.filter(agency=org)
    role = role_of(user)
    if role == User.Role.AGENCY:
        return qs
    if role == User.Role.MANAGER:
        tree = descendant_ids(user)
        return qs.filter(Q(manager=user) | Q(admin_id__in=tree) | Q(created_by=user) | Q(assigned_users=user)).distinct()
    if role == User.Role.ADMIN:
        return qs.filter(Q(admin=user) | Q(created_by=user) | Q(assigned_users=user)).distinct()
    return qs.filter(assigned_users=user).distinct()


def is_calling_agent(user):
    return role_of(user) == User.Role.USER


def assert_can_use_campaign(user, campaign):
    from campaigns.models import Campaign

    if not campaign:
        raise ValueError("Select a campaign before calling")
    if is_calling_agent(user) and not user.assigned_campaigns.filter(pk=campaign.pk).exists():
        raise ValueError("You must be assigned to a campaign before calling")
    if not scoped_campaigns(user, Campaign.objects.filter(pk=campaign.pk)).exists():
        raise ValueError("You cannot use this campaign")
    if not campaign.active and campaign.status not in {Campaign.Status.ACTIVE, Campaign.Status.RUNNING}:
        raise ValueError("Campaign is not active")
    return campaign


def scoped_leads(user, qs):
    if is_super_admin(user):
        return qs
    org = agency_of(user)
    if not org:
        return qs.filter(owner=user)
    qs = qs.filter(agency=org)
    role = role_of(user)
    if role in {User.Role.AGENCY, User.Role.MANAGER, User.Role.ADMIN, User.Role.SUPERVISOR}:
        return qs
    return qs.filter(Q(owner=user) | Q(campaign__assigned_users=user)).distinct()


def scoped_calls(user, qs):
    """Calls placed by this login or by people who report up to them."""
    if is_super_admin(user):
        return qs
    return qs.filter(agent_id__in=descendant_ids(user))


def scoped_recordings(user, qs):
    if is_super_admin(user):
        return qs
    return qs.filter(agent_id__in=descendant_ids(user))


def scoped_followups(user, qs):
    """Follow-ups for this login or for people who report up to them, on leads they can see."""
    from crm.models import Contact

    if is_super_admin(user):
        return qs
    leads = scoped_leads(user, Contact.objects.all())
    return qs.filter(agent_id__in=descendant_ids(user), contact__in=leads)


def require_perm(user, code):
    from rest_framework.exceptions import PermissionDenied

    if not has_perm(user, code):
        raise PermissionDenied("You do not have permission to perform this action.")
