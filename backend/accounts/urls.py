from django.urls import path

from .views import (
    AgencyDetailView,
    AgencyListCreateView,
    AuditListView,
    DashboardView,
    StaffDetailView,
    StaffListCreateView,
)

urlpatterns = [
    path("agencies/", AgencyListCreateView.as_view(), name="agency-list"),
    path("agencies/<int:pk>/", AgencyDetailView.as_view(), name="agency-detail"),
    path("staff/", StaffListCreateView.as_view(), name="staff-list"),
    path("staff/<int:pk>/", StaffDetailView.as_view(), name="staff-detail"),
    path("dashboard/", DashboardView.as_view(), name="dashboard"),
    path("audit-logs/", AuditListView.as_view(), name="audit-list"),
]
