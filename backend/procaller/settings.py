import os
from datetime import timedelta
from pathlib import Path
from urllib.parse import unquote, urlparse

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.getenv("SECRET_KEY", "procaller-dev-secret-change-me")
DEBUG = os.getenv("DEBUG", "1") == "1"
ALLOWED_HOSTS = [h.strip() for h in os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").split(",") if h.strip()]

INSTALLED_APPS = [
    "daphne",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt",
    "corsheaders",
    "channels",
    "accounts",
    "campaigns",
    "crm",
    "telephony",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "procaller.urls"
ASGI_APPLICATION = "procaller.asgi.application"
WSGI_APPLICATION = "procaller.wsgi.application"
AUTH_USER_MODEL = "accounts.User"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

_database_url = os.getenv("DATABASE_URL", "").strip()
if _database_url:
    parsed = urlparse(_database_url)
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": parsed.path.lstrip("/"),
            "USER": unquote(parsed.username or ""),
            "PASSWORD": unquote(parsed.password or ""),
            "HOST": parsed.hostname or "127.0.0.1",
            "PORT": str(parsed.port or 5432),
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
]

LANGUAGE_CODE = "en-in"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
DATA_UPLOAD_MAX_MEMORY_SIZE = 40 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:8443,http://127.0.0.1:8443,http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]
CORS_ALLOW_CREDENTIALS = True

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",
    }
}

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=12),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
}

COMPANY_NAME = "AP Infotech and Cyber Solution"
PRODUCT_NAME = "ProCaller"

TELEPHONY_BACKEND = os.getenv("TELEPHONY_BACKEND", "sandbox")
ASTERISK = {
    "ARI_URL": os.getenv("ASTERISK_ARI_URL", "http://192.168.1.200:8088"),
    "ARI_USER": os.getenv("ASTERISK_ARI_USER", "procaller"),
    "ARI_PASSWORD": os.getenv("ASTERISK_ARI_PASSWORD", "ProCallerAmi0478"),
    "ARI_APP": os.getenv("ASTERISK_ARI_APP", "procaller"),
    "AMI_HOST": os.getenv("ASTERISK_AMI_HOST", "192.168.1.200"),
    "AMI_PORT": os.getenv("ASTERISK_AMI_PORT", "5038"),
    "AMI_USER": os.getenv("ASTERISK_AMI_USER", "procaller"),
    "AMI_SECRET": os.getenv("ASTERISK_AMI_SECRET", "ProCallerAmi0478"),
    "SIP_WS": os.getenv("ASTERISK_SIP_WS", "ws://192.168.1.200:8088/ws"),
    "SIP_DOMAIN": os.getenv("ASTERISK_SIP_DOMAIN", "192.168.1.200"),
    "TRUNK": os.getenv("ASTERISK_TRUNK", "gsm222"),
    "DIAL_PREFIX": os.getenv("ASTERISK_DIAL_PREFIX", ""),
    "STRIP_COUNTRY_CODE": os.getenv("ASTERISK_STRIP_COUNTRY_CODE", "91"),
}
