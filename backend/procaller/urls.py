from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path

admin.site.site_header = "ProCaller Admin"
admin.site.site_title = "ProCaller"
admin.site.index_title = "AP Infotech and Cyber Solution"


def health(_request):
    return JsonResponse({"ok": True, "product": "ProCaller", "company": "AP Infotech and Cyber Solution"})


urlpatterns = [
    path("api/health/", health),
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("campaigns.urls")),
    path("api/", include("crm.urls")),
    path("api/", include("telephony.urls")),
]
