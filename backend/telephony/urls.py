from django.urls import path

from .views import (
    ActiveCallView,
    AgentModeView,
    AgentTodayView,
    CallAnswerView,
    CallControlView,
    CallDispositionView,
    CallHangupView,
    CallListCreateView,
    CallRecordingUploadView,
    CallRingingView,
    PreviewBatchView,
    RecordingExportView,
    RecordingFileView,
    RecordingListView,
    SessionEndView,
    SessionStartView,
)

urlpatterns = [
    path("telephony/session/", SessionStartView.as_view(), name="telephony-session-start"),
    path("telephony/session/end/", SessionEndView.as_view(), name="telephony-session-end"),
    path("calls/", CallListCreateView.as_view(), name="call-list"),
    path("calls/preview-batch/", PreviewBatchView.as_view(), name="call-preview-batch"),
    path("calls/active/", ActiveCallView.as_view(), name="call-active"),
    path("calls/<int:pk>/hangup/", CallHangupView.as_view(), name="call-hangup"),
    path("calls/<int:pk>/ringing/", CallRingingView.as_view(), name="call-ringing"),
    path("calls/<int:pk>/control/", CallControlView.as_view(), name="call-control"),
    path("calls/<int:pk>/answer/", CallAnswerView.as_view(), name="call-answer"),
    path("calls/<int:pk>/disposition/", CallDispositionView.as_view(), name="call-disposition"),
    path("calls/<int:pk>/recording/", CallRecordingUploadView.as_view(), name="call-recording-upload"),
    path("recordings/", RecordingListView.as_view(), name="recording-list"),
    path("recordings/export/", RecordingExportView.as_view(), name="recording-export"),
    path("recordings/<int:pk>/file/", RecordingFileView.as_view(), name="recording-file"),
    path("agent/mode/", AgentModeView.as_view(), name="agent-mode"),
    path("agent/today/", AgentTodayView.as_view(), name="agent-today"),
]
