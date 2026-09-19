from abc import ABC, abstractmethod


class TelephonyBackend(ABC):
    name = "base"

    @abstractmethod
    def session_payload(self, user, session):
        raise NotImplementedError

    @abstractmethod
    def originate(self, call):
        raise NotImplementedError

    @abstractmethod
    def hangup(self, call):
        raise NotImplementedError

    def hold(self, call, on_hold: bool):
        return None

    def send_dtmf(self, call, digit: str):
        return None
