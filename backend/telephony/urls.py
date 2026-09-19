from django.urls import path

from .views import (
    ActiveCallView,
    CallAnswerView,
    CallControlView,
    CallDispositionView,
    CallHangupView,
    CallRingingView,
    CallListCreateView,
    SessionEndView,
    SessionStartView,
)

urlpatterns = [
    path("telephony/session/", SessionStartView.as_view(), name="telephony-session-start"),
    path("telephony/session/end/", SessionEndView.as_view(), name="telephony-session-end"),
    path("calls/", CallListCreateView.as_view(), name="call-list"),
    path("calls/active/", ActiveCallView.as_view(), name="call-active"),
    path("calls/<int:pk>/hangup/", CallHangupView.as_view(), name="call-hangup"),
    path("calls/<int:pk>/ringing/", CallRingingView.as_view(), name="call-ringing"),
    path("calls/<int:pk>/control/", CallControlView.as_view(), name="call-control"),
    path("calls/<int:pk>/answer/", CallAnswerView.as_view(), name="call-answer"),
    path("calls/<int:pk>/disposition/", CallDispositionView.as_view(), name="call-disposition"),
]
