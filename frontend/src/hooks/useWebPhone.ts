import { useCallback, useRef } from 'react';
import { Inviter, Registerer, SessionState, UserAgent } from 'sip.js';
import type { TelephonySession } from '../api/types';

type SipBundle = {
  ua: UserAgent;
  registerer: Registerer;
  conference: Inviter | null;
  audio: HTMLAudioElement;
  local?: MediaStream;
};

export type CallListeners = {
  onProgress?: () => void;
  onAccept?: () => void;
  onHangup?: () => void;
};

let shared: SipBundle | null = null;
let owners = 0;
let stopTimer: ReturnType<typeof setTimeout> | null = null;

function ensureAudioEl() {
  if (shared?.audio) return shared.audio;
  const el = document.createElement('audio');
  el.autoplay = true;
  el.setAttribute('playsinline', 'true');
  document.body.appendChild(el);
  return el;
}

function attachRemote(session: Inviter) {
  const handler = session.sessionDescriptionHandler as { peerConnection?: RTCPeerConnection } | undefined;
  const pc = handler?.peerConnection;
  if (!pc) return;
  const pump = () => {
    const stream = new MediaStream();
    pc.getReceivers().forEach((receiver) => {
      if (receiver.track) stream.addTrack(receiver.track);
    });
    const el = ensureAudioEl();
    el.muted = false;
    el.volume = 1;
    el.srcObject = stream;
    el.play().catch(() => undefined);
  };
  pc.ontrack = () => pump();
  pump();
}

function hangupInviter(inviter: Inviter | null) {
  if (!inviter || inviter.state === SessionState.Terminated) return;
  if (inviter.state === SessionState.Established) {
    try { inviter.bye(); } catch { /* ignore */ }
    return;
  }
  try { inviter.cancel(); } catch { /* ignore */ }
}

export function useWebPhone() {
  const pcLocal = useRef<RTCPeerConnection | null>(null);
  const pcRemote = useRef<RTCPeerConnection | null>(null);
  const ringtone = useRef<AudioContext | null>(null);
  const oscillators = useRef<OscillatorNode[]>([]);
  const sipMode = useRef(false);

  const startMic = useCallback(async () => {
    if (shared?.local) return shared.local;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    if (shared) shared.local = stream;
    return stream;
  }, []);

  const playRingtone = useCallback(async () => {
    oscillators.current.forEach((o) => { try { o.stop(); } catch { /* ignore */ } });
    ringtone.current?.close();
    const ctx = new AudioContext();
    await ctx.resume().catch(() => undefined);
    ringtone.current = ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0.07;
    gain.connect(ctx.destination);
    const playBurst = () => {
      if (ringtone.current !== ctx) return;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.value = 440;
      osc2.frequency.value = 480;
      osc1.connect(gain);
      osc2.connect(gain);
      osc1.start();
      osc2.start();
      oscillators.current = [osc1, osc2];
      setTimeout(() => {
        try { osc1.stop(); osc2.stop(); } catch { /* ignore */ }
      }, 400);
    };
    playBurst();
    const pulse = window.setInterval(playBurst, 1200);
    (ctx as AudioContext & { _pulse?: number })._pulse = pulse;
  }, []);

  const stopRingtone = useCallback(() => {
    oscillators.current.forEach((o) => { try { o.stop(); } catch { /* ignore */ } });
    oscillators.current = [];
    const ctx = ringtone.current as (AudioContext & { _pulse?: number }) | null;
    if (ctx?._pulse) window.clearInterval(ctx._pulse);
    ctx?.close();
    ringtone.current = null;
  }, []);

  const startLoopback = useCallback(async (iceServers: RTCIceServer[]) => {
    if (sipMode.current) return;
    pcLocal.current?.close();
    pcRemote.current?.close();
    const stream = await startMic();
    const a = new RTCPeerConnection({ iceServers });
    const b = new RTCPeerConnection({ iceServers });
    pcLocal.current = a;
    pcRemote.current = b;
    stream.getTracks().forEach((track) => a.addTrack(track, stream));
    b.ontrack = (ev) => {
      const el = ensureAudioEl();
      el.srcObject = ev.streams[0];
    };
    a.onicecandidate = (ev) => ev.candidate && b.addIceCandidate(ev.candidate);
    b.onicecandidate = (ev) => ev.candidate && a.addIceCandidate(ev.candidate);
    const offer = await a.createOffer();
    await a.setLocalDescription(offer);
    await b.setRemoteDescription(offer);
    const answer = await b.createAnswer();
    await b.setLocalDescription(answer);
    await a.setRemoteDescription(answer);
  }, [startMic]);

  const stopLoopback = useCallback(() => {
    pcLocal.current?.close();
    pcRemote.current?.close();
    pcLocal.current = null;
    pcRemote.current = null;
  }, []);

  const connectSip = useCallback(async (sip: NonNullable<TelephonySession['sip']>) => {
    sipMode.current = true;
    owners += 1;
    if (stopTimer) {
      clearTimeout(stopTimer);
      stopTimer = null;
    }
    if (shared?.ua) return;
    const stream = await startMic();
    const uri = UserAgent.makeURI(sip.uri);
    if (!uri) throw new Error('Invalid SIP URI');
    const username = sip.uri.split(':')[1]?.split('@')[0] || '';
    const ua = new UserAgent({
      uri,
      authorizationUsername: username,
      authorizationPassword: sip.password,
      displayName: sip.display_name,
      transportOptions: { server: sip.ws_url },
      sessionDescriptionHandlerFactoryOptions: {
        constraints: { audio: true, video: false },
        peerConnectionConfiguration: {
          iceServers: [],
        },
      },
    });
    await ua.start();
    const registerer = new Registerer(ua);
    await registerer.register();
    shared = { ua, registerer, conference: null, audio: ensureAudioEl(), local: stream };
  }, [startMic]);

  const placeCall = useCallback(async (
    sip: NonNullable<TelephonySession['sip']>,
    number: string,
    listeners: CallListeners = {},
  ) => {
    if (!shared?.ua) await connectSip(sip);
    if (!shared?.ua) throw new Error('Web phone is not registered');
    hangupInviter(shared.conference);
    if (shared) shared.conference = null;
    const domain = sip.uri.split('@')[1] || '';
    const target = UserAgent.makeURI(`sip:${number}@${domain}`);
    if (!target) throw new Error('Invalid destination');
    const audio = ensureAudioEl();
    audio.muted = false;
    audio.play().catch(() => undefined);
    const inviter = new Inviter(shared.ua, target, {
      earlyMedia: true,
      sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } },
    });
    shared.conference = inviter;
    let accepted = false;
    inviter.stateChange.addListener((state) => {
      if (state === SessionState.Establishing) {
        attachRemote(inviter);
        listeners.onProgress?.();
      }
      if (state === SessionState.Established) {
        accepted = true;
        attachRemote(inviter);
        listeners.onAccept?.();
      }
      if (state === SessionState.Terminated) {
        if (shared?.conference === inviter) shared.conference = null;
        listeners.onHangup?.();
      }
    });
    await inviter.invite({
      requestDelegate: {
        onProgress: () => {
          attachRemote(inviter);
          listeners.onProgress?.();
        },
        onAccept: () => {
          attachRemote(inviter);
          if (!accepted) listeners.onAccept?.();
        },
      },
    });
  }, [connectSip]);

  const hangupCall = useCallback(() => {
    hangupInviter(shared?.conference || null);
    if (shared) shared.conference = null;
  }, []);

  const joinConference = useCallback(async (sip: NonNullable<TelephonySession['sip']>) => {
    await placeCall(sip, sip.conference);
  }, [placeCall]);

  const leaveConference = useCallback(() => {
    hangupCall();
  }, [hangupCall]);

  const setMuted = useCallback((muted: boolean) => {
    shared?.local?.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
    const handler = shared?.conference?.sessionDescriptionHandler as { peerConnection?: RTCPeerConnection } | undefined;
    handler?.peerConnection?.getSenders().forEach((sender) => {
      if (sender.track && sender.track.kind === 'audio') sender.track.enabled = !muted;
    });
  }, []);

  const sendDtmfTone = useCallback((digit: string) => {
    const handler = shared?.conference?.sessionDescriptionHandler as { peerConnection?: RTCPeerConnection } | undefined;
    const sender = handler?.peerConnection?.getSenders().find((s) => s.track?.kind === 'audio' && s.dtmf);
    if (sender?.dtmf) {
      sender.dtmf.insertDTMF(digit, 160);
    }
  }, []);

  const shutdown = useCallback(() => {
    owners = Math.max(0, owners - 1);
  }, []);

  const forceStop = useCallback(() => {
    owners = 0;
    if (stopTimer) {
      clearTimeout(stopTimer);
      stopTimer = null;
    }
    stopRingtone();
    stopLoopback();
    hangupInviter(shared?.conference || null);
    try { shared?.registerer.unregister(); } catch { /* ignore */ }
    try { shared?.ua.stop(); } catch { /* ignore */ }
    shared?.local?.getTracks().forEach((t) => t.stop());
    shared?.audio.remove();
    shared = null;
    sipMode.current = false;
  }, [stopLoopback, stopRingtone]);

  return {
    startMic,
    playRingtone,
    stopRingtone,
    startLoopback,
    stopLoopback,
    connectSip,
    placeCall,
    hangupCall,
    joinConference,
    leaveConference,
    setMuted,
    sendDtmfTone,
    shutdown,
    forceStop,
  };
}

export function forceStopPhone() {
  owners = 0;
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  hangupInviter(shared?.conference || null);
  try { shared?.registerer.unregister(); } catch { /* ignore */ }
  try { shared?.ua.stop(); } catch { /* ignore */ }
  shared?.local?.getTracks().forEach((t) => t.stop());
  shared?.audio.remove();
  shared = null;
}
