import os

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path, re_path

from .spa import spa

admin.site.site_header = "ProCaller Admin"
admin.site.site_title = "ProCaller"
admin.site.index_title = "AP Infotech and Cyber Solution"


def health(_request):
    return JsonResponse({"ok": True, "product": "ProCaller", "company": "AP Infotech and Cyber Solution"})


urlpatterns = [
    path("api/health/", health),
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.auth_urls")),
    path("api/", include("accounts.urls")),
    path("api/", include("campaigns.urls")),
    path("api/", include("crm.urls")),
    path("api/", include("telephony.urls")),
]

if settings.DEBUG or os.getenv("SERVE_MEDIA", "1") == "1":
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

urlpatterns += [
    re_path(r"^(?P<path>.*)$", spa),
]
