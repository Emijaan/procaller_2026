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
        extra.setdefault("role", User.Role.ADMIN)
        return self._create_user(email, password, **extra)


class Organization(models.Model):
    name = models.CharField(max_length=200, default="AP Infotech and Cyber Solution")
    product_name = models.CharField(max_length=80, default="ProCaller")
    timezone = models.CharField(max_length=64, default="Asia/Kolkata")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
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
    organization = models.ForeignKey(Organization, null=True, blank=True, on_delete=models.SET_NULL)

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
