from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email)
        extra.setdefault("username", email)
        user = self.model(email=email, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("role", User.Role.SUPER_ADMIN)
        return self._create_user(email, password, **extra)


class Organization(models.Model):
    class Subscription(models.TextChoices):
        TRIAL = "trial", "Trial"
        ACTIVE = "active", "Active"
        SUSPENDED = "suspended", "Suspended"
        EXPIRED = "expired", "Expired"

    name = models.CharField(max_length=200, default="AP Infotech and Cyber Solution")
    product_name = models.CharField(max_length=80, default="ProCaller")
    timezone = models.CharField(max_length=64, default="Asia/Kolkata")
    is_active = models.BooleanField(default=True)
    subscription_status = models.CharField(max_length=20, choices=Subscription.choices, default=Subscription.ACTIVE)
    max_managers = models.PositiveIntegerField(default=10)
    max_admins = models.PositiveIntegerField(default=30)
    max_users = models.PositiveIntegerField(default=300)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Agency"
        verbose_name_plural = "Agencies"

    def __str__(self):
        return self.name


class User(AbstractUser):
    class Role(models.TextChoices):
        SUPER_ADMIN = "super_admin", "Super Admin"
        AGENCY = "agency", "Agency"
        MANAGER = "manager", "Manager"
        ADMIN = "admin", "Admin"
        USER = "user", "User"
        SUPERVISOR = "supervisor", "Supervisor"
        AGENT = "agent", "Agent"

    class Presence(models.TextChoices):
        OFFLINE = "offline", "Offline"
        AVAILABLE = "available", "Available"
        PAUSED = "paused", "Paused"
        ON_CALL = "on_call", "On Call"
        WRAP_UP = "wrap_up", "Wrap Up"

    username = models.CharField(max_length=150, unique=True)
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.AGENT)
    team = models.CharField(max_length=80, blank=True, default="")
    extension = models.CharField(max_length=16, blank=True, default="")
    sip_username = models.CharField(max_length=64, blank=True, default="")
    sip_password = models.CharField(max_length=128, blank=True, default="")
    presence = models.CharField(max_length=20, choices=Presence.choices, default=Presence.OFFLINE)
    avatar_initials = models.CharField(max_length=4, blank=True, default="")
    organization = models.ForeignKey(
        Organization, null=True, blank=True, on_delete=models.SET_NULL, related_name="members"
    )
    reports_to = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="direct_reports"
    )
    extra_permissions = models.JSONField(default=list, blank=True)
    denied_permissions = models.JSONField(default=list, blank=True)
    max_admins = models.PositiveIntegerField(default=5)
    max_users = models.PositiveIntegerField(default=50)

    objects = UserManager()
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    def save(self, *args, **kwargs):
        if not self.username:
            self.username = self.email
        if not self.avatar_initials and (self.first_name or self.last_name):
            self.avatar_initials = f"{self.first_name[:1]}{self.last_name[:1]}".upper()
        super().save(*args, **kwargs)

    @property
    def display_name(self):
        full = f"{self.first_name} {self.last_name}".strip()
        return full or self.email.split("@")[0]

    @property
    def normalized_role(self):
        if self.role == self.Role.SUPERVISOR:
            return self.Role.MANAGER
        if self.role == self.Role.AGENT:
            return self.Role.USER
        if self.is_superuser and self.role == self.Role.ADMIN:
            return self.Role.SUPER_ADMIN
        return self.role


class Permission(models.Model):
    code = models.CharField(max_length=64, unique=True)
    label = models.CharField(max_length=120)

    def __str__(self):
        return self.code


class RolePermission(models.Model):
    role = models.CharField(max_length=20)
    permission = models.ForeignKey(Permission, on_delete=models.CASCADE, related_name="role_links")

    class Meta:
        unique_together = ("role", "permission")


class AuditLog(models.Model):
    user = models.ForeignKey("User", null=True, blank=True, on_delete=models.SET_NULL)
    agency = models.ForeignKey(Organization, null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=80, db_index=True)
    object_type = models.CharField(max_length=80, blank=True, default="")
    object_id = models.CharField(max_length=64, blank=True, default="")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]
