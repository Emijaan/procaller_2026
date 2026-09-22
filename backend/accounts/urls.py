from django.urls import path

from telephony.reports import CampaignReportView, DailyReportView, LiveActionView, LiveAgentsView, ReportExportView

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
    path("live/agents/", LiveAgentsView.as_view(), name="live-agents"),
    path("live/actions/", LiveActionView.as_view(), name="live-actions"),
    path("reports/daily/", DailyReportView.as_view(), name="report-daily"),
    path("reports/campaigns/", CampaignReportView.as_view(), name="report-campaigns"),
    path("reports/export/", ReportExportView.as_view(), name="report-export"),
]
