import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, Button, Badge, Avatar, ScoreRing, Modal } from '../ui/index';
import { api } from '../../api/client';
import type { CallRecord, Campaign, Contact, TelephonySession } from '../../api/types';
import { useAuth } from '../../context/AuthContext';
import { useAgentSocket } from '../../hooks/useAgentSocket';
import { useWebPhone } from '../../hooks/useWebPhone';

type CallState = 'idle' | 'initiating' | 'ringing' | 'connected' | 'on_hold' | 'ended';
type DialerMode = 'manual' | 'preview' | 'progressive';

const LAST_DIAL_KEY = 'procaller.lastDial';
const DIAL_CHARS = /[^0-9+*#]/g;

function sanitizeDial(value: string) {
  return (value || '').replace(DIAL_CHARS, '');
}

function pstnNumber(value: string) {
  let digits = (value || '').replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  return digits;
}

function readLastDial() {
  return sanitizeDial(localStorage.getItem(LAST_DIAL_KEY) || '');
}

const dispositions = [
  { key: '1', label: 'Interested', variant: 'success' as const },
  { key: '2', label: 'Callback Requested', variant: 'info' as const },
  { key: '3', label: 'Not Interested', variant: 'danger' as const },
  { key: '4', label: 'No Answer', variant: 'muted' as const },
  { key: '5', label: 'Voicemail', variant: 'warning' as const },
  { key: '6', label: 'Wrong Number', variant: 'muted' as const },
  { key: '7', label: 'Busy', variant: 'warning' as const },
  { key: '8', label: 'Converted', variant: 'purple' as const },
];

function useTimer(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (running) { ref.current = setInterval(() => setSeconds(s => s + 1), 1000); }
    else if (ref.current) clearInterval(ref.current);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [running]);
  useEffect(() => { if (!running) setSeconds(0); }, [running]);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function emptyContact(phone = ''): Contact {
  return {
    id: 0,
    name: phone || 'Unknown',
    phone,
    email: '',
    company: '',
    status: '',
    owner: null,
    owner_name: '',
    campaign: null,
    campaign_name: '',
    tags: [],
    lead_score: 0,
    comments: '',
    last_disposition: '',
    last_contact_at: null,
  };
}

function contactFromCall(call: CallRecord): Contact {
  return {
    id: call.contact || 0,
    name: call.contact_name || call.customer || call.phone_number,
    phone: call.phone_number,
    email: call.contact_email,
    company: call.contact_company,
    status: call.contact_status,
    owner: null,
    owner_name: '',
    campaign: call.campaign,
    campaign_name: call.campaign_name,
    tags: call.contact_tags || [],
    lead_score: call.contact_score || 0,
    comments: call.contact_comments,
    last_disposition: call.last_disposition,
    last_contact_at: null,
  };
}

export default function Dialer({ showToast }: { showToast: (msg: string, type?: 'success' | 'info' | 'error') => void }) {
  const { user } = useAuth();
  const phone = useWebPhone();
  const [mode, setMode] = useState<DialerMode>('manual');
  const [dialNumber, setDialNumber] = useState('');
  const [callState, setCallState] = useState<CallState>('idle');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<number | ''>('');
  const [currentContact, setCurrentContact] = useState<Contact>(emptyContact());
  const [muted, setMuted] = useState(false);
  const [onHold, setOnHold] = useState(false);
  const [recording, setRecording] = useState(false);
  const [note, setNote] = useState('');
  const [showDisposition, setShowDisposition] = useState(false);
  const [selectedDisposition, setSelectedDisposition] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [followUpTime, setFollowUpTime] = useState('');
  const [showKeypad, setShowKeypad] = useState(false);
  const [dtmf, setDtmf] = useState('');
  const [phoneReady, setPhoneReady] = useState(false);
  const [phoneMode, setPhoneMode] = useState('connecting');
  const [activeCall, setActiveCall] = useState<CallRecord | null>(null);
  const sessionRef = useRef<TelephonySession | null>(null);
  const callIdRef = useRef<number | null>(null);
  const lastCallTap = useRef(0);
  const endingRef = useRef(false);
  const backspaceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dialInputRef = useRef<HTMLInputElement | null>(null);
  const timer = useTimer(callState === 'connected' || callState === 'on_hold');

  useEffect(() => {
    api<Contact[]>('/api/contacts/').then((rows) => {
      setContacts(rows);
      if (rows[0]) setCurrentContact(rows[0]);
    }).catch(() => undefined);
    api<Campaign[]>('/api/campaigns/').then((rows) => {
      setCampaigns(rows);
      if (rows[0]) setCampaignId(rows[0].id);
    }).catch(() => undefined);
    const pending = sessionStorage.getItem('procaller.pendingDial');
    if (pending) {
      setMode('manual');
      setDialNumber(pending);
      sessionStorage.removeItem('procaller.pendingDial');
    }
  }, []);

  const loadNextLead = useCallback(async () => {
    try {
      const qs = campaignId ? `?campaign=${campaignId}` : '';
      const lead = await api<Contact>(`/api/leads/next/${qs}`);
      setCurrentContact(lead);
      setDialNumber(lead.phone || '');
      return lead;
    } catch (err) {
      setCurrentContact(emptyContact());
      showToast(err instanceof Error ? err.message : 'No leads available', 'info');
      return null;
    }
  }, [campaignId, showToast]);

  useEffect(() => {
    if (mode === 'preview') loadNextLead();
  }, [mode, campaignId, loadNextLead]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await api<TelephonySession>('/api/telephony/session/', {
          method: 'POST',
          body: JSON.stringify({ campaign_id: campaignId || undefined }),
        });
        if (cancelled) return;
        sessionRef.current = session;
        setPhoneMode(session.mode);
        await phone.startMic();
        if (session.mode === 'asterisk' && session.sip) {
          await phone.connectSip(session.sip);
          setPhoneMode(`asterisk · ${session.sip.conference}`);
        }
        setPhoneReady(true);
      } catch (err) {
        if (!cancelled) {
          setPhoneReady(false);
          showToast(err instanceof Error ? err.message : 'Could not start phone session', 'error');
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => {
    phone.shutdown();
  }, []);

  const applyCall = useCallback((call: CallRecord) => {
    setActiveCall(call);
    callIdRef.current = call.id;
    setCurrentContact(contactFromCall(call));
    if (call.state === 'initiating' || call.state === 'ringing' || call.state === 'connected' || call.state === 'on_hold' || call.state === 'ended') {
      setCallState(call.state);
    }
    if (call.state === 'connected' || call.state === 'on_hold') {
      phone.stopRingtone();
    }
    setMuted(call.muted);
    setOnHold(call.on_hold);
    setRecording(call.recording);
    if (call.notes) setNote(call.notes);
  }, [phone]);

  useAgentSocket((payload) => {
    if (payload?.call) applyCall(payload.call);
    if (payload?.type === 'call.ringing') {
      setCallState('ringing');
      if (sessionRef.current?.mode !== 'asterisk') phone.playRingtone();
    }
    if (payload?.type === 'call.answered') {
      setCallState('connected');
      phone.stopRingtone();
      if (sessionRef.current?.mode !== 'asterisk') {
        const ice = sessionRef.current?.ice_servers || [{ urls: 'stun:stun.l.google.com:19302' }];
        phone.startLoopback(ice).catch(() => undefined);
      }
    }
    if (payload?.type === 'call.ended') {
      endingRef.current = true;
      phone.stopRingtone();
      phone.stopHoldMusic().catch(() => undefined);
      phone.stopLoopback();
      phone.hangupCall();
      setCallState('ended');
      if (payload.call?.outcome === 'Busy') {
        showToast('Gateway returned busy (SIP 486). Check Synway ports/SIM.', 'error');
      }
      setShowDisposition(true);
    }
  }, phoneReady);

  useEffect(() => {
    if (callState !== 'initiating' && callState !== 'ringing') return;
    const tick = window.setInterval(() => {
      api<{ call: CallRecord | null }>('/api/calls/active/').then((data) => {
        if (data.call) applyCall(data.call);
      }).catch(() => undefined);
    }, 800);
    return () => window.clearInterval(tick);
  }, [callState, applyCall]);

  const startCall = async (overrideNumber?: string) => {
    const number = sanitizeDial(overrideNumber ?? (mode === 'manual' ? dialNumber : currentContact.phone));
    if (!number) {
      showToast('Enter a number to dial', 'error');
      return;
    }
    if (mode === 'manual') setDialNumber(number);
    localStorage.setItem(LAST_DIAL_KEY, number);
    setCallState('initiating');
    endingRef.current = false;
    const isAsterisk = sessionRef.current?.mode === 'asterisk' && !!sessionRef.current.sip;
    if (!isAsterisk) phone.playRingtone();
    try {
      const dest = pstnNumber(number) || number;
      const call = await api<CallRecord>('/api/calls/', {
        method: 'POST',
        body: JSON.stringify({
          phone_number: dest,
          contact_id: mode !== 'manual' && currentContact.id ? currentContact.id : undefined,
          campaign_id: campaignId || undefined,
          client_dial: isAsterisk,
        }),
      });
      applyCall(call);
      if (isAsterisk && sessionRef.current?.sip) {
        await phone.placeCall(sessionRef.current.sip, dest, {
          onProgress: () => {
            setCallState('ringing');
            api(`/api/calls/${call.id}/ringing/`, { method: 'POST' }).catch(() => undefined);
          },
          onAccept: () => {
            setCallState('ringing');
            api(`/api/calls/${call.id}/ringing/`, { method: 'POST' }).catch(() => undefined);
          },
          onHangup: () => {
            if (endingRef.current) return;
            endingRef.current = true;
            api(`/api/calls/${call.id}/hangup/`, { method: 'POST' }).catch(() => undefined);
            setCallState('ended');
            setShowDisposition(true);
          },
        });
      }
      showToast(`Calling ${call.customer}...`, 'info');
    } catch (err) {
      phone.stopRingtone();
      phone.hangupCall();
      const liveId = callIdRef.current;
      if (liveId) {
        api(`/api/calls/${liveId}/hangup/`, { method: 'POST' }).catch(() => undefined);
      }
      setCallState('idle');
      showToast(err instanceof Error ? err.message : 'Dial failed', 'error');
    }
  };

  const handleCallButton = () => {
    const now = Date.now();
    const isDoubleTap = now - lastCallTap.current < 400;
    lastCallTap.current = now;
    const last = readLastDial();

    if (isDoubleTap && last) {
      setMode('manual');
      setDialNumber(last);
      startCall(last);
      return;
    }
    if (mode === 'manual' && !sanitizeDial(dialNumber)) {
      if (last) {
        setDialNumber(last);
        showToast('Last number loaded — tap Call again to dial', 'info');
      } else {
        showToast('Enter a number to dial', 'error');
      }
      return;
    }
    startCall();
  };

  const deleteDigit = () => setDialNumber((p) => p.slice(0, -1));
  const clearNumber = () => setDialNumber('');

  const onBackspaceDown = () => {
    if (backspaceTimer.current) clearTimeout(backspaceTimer.current);
    backspaceTimer.current = setTimeout(() => {
      clearNumber();
      backspaceTimer.current = null;
    }, 450);
  };
  const onBackspaceUp = () => {
    if (backspaceTimer.current) {
      clearTimeout(backspaceTimer.current);
      backspaceTimer.current = null;
      deleteDigit();
    }
  };

  const endCall = async () => {
    const id = callIdRef.current;
    endingRef.current = true;
    phone.stopRingtone();
    phone.stopHoldMusic().catch(() => undefined);
    phone.stopLoopback();
    phone.hangupCall();
    if (id) {
      try {
        const call = await api<CallRecord>(`/api/calls/${id}/hangup/`, { method: 'POST' });
        applyCall(call);
      } catch {
        setCallState('ended');
      }
    } else {
      setCallState('ended');
    }
    setShowDisposition(true);
  };

  const saveDisposition = async () => {
    const id = callIdRef.current;
    if (id && selectedDisposition) {
      let follow_up_at = '';
      if (followUpDate) follow_up_at = followUpTime ? `${followUpDate}T${followUpTime}:00` : `${followUpDate}T10:00:00`;
      try {
        await api(`/api/calls/${id}/disposition/`, {
          method: 'POST',
          body: JSON.stringify({
            disposition: selectedDisposition,
            notes: note,
            follow_up_at: follow_up_at || undefined,
          }),
        });
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not save disposition', 'error');
        return;
      }
    }
    showToast('Call disposition saved.', 'success');
    setShowDisposition(false);
    setCallState('idle');
    setActiveCall(null);
    callIdRef.current = null;
    setMuted(false);
    setOnHold(false);
    setNote('');
    setSelectedDisposition('');
    setFollowUpDate('');
    setFollowUpTime('');
    setDtmf('');
    if (mode === 'preview') {
      await loadNextLead();
    } else {
      const idx = contacts.findIndex((c) => c.id === currentContact.id);
      if (idx >= 0 && contacts[idx + 1]) setCurrentContact(contacts[idx + 1]);
    }
  };

  const toggleMute = async () => {
    const next = !muted;
    setMuted(next);
    phone.setMuted(next);
    if (callIdRef.current) {
      await api(`/api/calls/${callIdRef.current}/control/`, { method: 'POST', body: JSON.stringify({ muted: next }) }).catch(() => undefined);
    }
    showToast(next ? 'Muted' : 'Unmuted', 'info');
  };

  const toggleHold = async () => {
    const next = !onHold;
    setOnHold(next);
    setCallState(next ? 'on_hold' : 'connected');
    if (next) {
      const camp = campaigns.find((c) => c.id === campaignId);
      const holdUrl = camp?.has_hold_audio ? `/api/campaigns/${camp.id}/hold-audio/` : null;
      try {
        await phone.startHoldMusic(holdUrl);
      } catch (err) {
        await phone.startHoldMusic(null);
        showToast(err instanceof Error ? err.message : 'Playing default hold tone', 'info');
      }
    } else {
      await phone.stopHoldMusic();
      phone.setMuted(muted);
    }
    if (callIdRef.current) {
      await api(`/api/calls/${callIdRef.current}/control/`, { method: 'POST', body: JSON.stringify({ on_hold: next }) }).catch(() => undefined);
    }
    showToast(next ? 'Customer on hold' : 'Call resumed', 'info');
  };

  const pressKey = (key: string) => {
    if (callState === 'connected' || callState === 'on_hold') {
      setDtmf((p) => p + key);
      phone.sendDtmfTone(key);
      return;
    }
    setDialNumber((p) => sanitizeDial(p + key));
  };

  useEffect(() => {
    if (callState !== 'idle') return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const isDialField = target === dialInputRef.current;
      const inOtherField = !isDialField && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable);
      if (inOtherField) return;
      if (isDialField && e.key !== 'Enter') return;

      if (e.key === 'Enter') {
        e.preventDefault();
        handleCallButton();
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        if (e.repeat) clearNumber();
        else deleteDigit();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Escape') {
        e.preventDefault();
        clearNumber();
        return;
      }
      if (e.key.length === 1 && /[0-9+*#]/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        pressKey(e.key);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [callState, dialNumber, mode, phoneReady]);

  const keypadKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
  const displayName = currentContact.name || activeCall?.customer || 'Unknown';
  const displayPhone = currentContact.phone || activeCall?.phone_number || dialNumber;
  const initials = currentContact.name.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'PC';

  return (
    <div className="flex-1 overflow-hidden bg-[#F8FAFC] fade-in flex flex-col">
      <div className="border-b border-[#E2E8F0] bg-white px-6 py-3 flex items-center gap-4 shrink-0">
        <div className="flex items-center gap-1.5 bg-slate-100 rounded-lg p-1">
          {(['manual', 'preview', 'progressive'] as DialerMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              disabled={m === 'progressive'}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${mode === m ? 'bg-white shadow-sm text-[#4F46E5]' : 'text-slate-500 hover:text-slate-700'} disabled:opacity-40`}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <span>Campaign:</span>
          <select
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value ? Number(e.target.value) : '')}
            className="text-sm font-medium text-slate-800 bg-transparent border-none focus:outline-none cursor-pointer"
          >
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className={`text-xs font-medium ${phoneReady ? 'text-green-600' : 'text-amber-600'}`}>
            {phoneReady ? `WebRTC ${phoneMode} · ext ${user?.extension || '—'}` : 'Connecting phone...'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex">
        <div className="w-72 border-r border-[#E2E8F0] bg-white overflow-y-auto shrink-0">
          <div className="p-4 border-b border-[#E2E8F0]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Current Lead</h3>
              <Badge variant={mode === 'manual' ? 'info' : 'success'} dot>{mode === 'manual' ? 'Manual' : 'Preview'}</Badge>
            </div>
            <div className="flex items-center gap-3 mb-4">
              <Avatar initials={initials} size="lg" />
              <div>
                <p className="font-semibold text-slate-900">{displayName}</p>
                <p className="text-sm text-slate-500">{currentContact.company || 'Direct dial'}</p>
              </div>
            </div>
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-sm">
                <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                <span className="font-mono text-slate-700">{displayPhone || '—'}</span>
              </div>
              {currentContact.email && (
                <div className="flex items-center gap-2 text-sm">
                  <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  <span className="text-slate-600 text-xs">{currentContact.email}</span>
                </div>
              )}
            </div>
          </div>

          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Lead Status</span>
              <Badge variant="success">{(currentContact.lead_status || currentContact.status || 'New').replace(/_/g, ' ')}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Lead Score</span>
              <ScoreRing score={currentContact.lead_score || 0} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Last Disposition</span>
              <Badge variant="info">{currentContact.last_disposition || '—'}</Badge>
            </div>
            {!!currentContact.tags.length && (
              <div>
                <span className="text-xs text-slate-500 block mb-1.5">Tags</span>
                <div className="flex flex-wrap gap-1">
                  {currentContact.tags.map((tag) => <Badge key={tag} variant="default">{tag}</Badge>)}
                </div>
              </div>
            )}
            {currentContact.extra_data && Object.keys(currentContact.extra_data).length > 0 && (
              <div className="pt-2 border-t border-[#E2E8F0] space-y-1.5">
                <p className="text-xs text-slate-500 mb-1">Lead details</p>
                {Object.entries(currentContact.extra_data).slice(0, 8).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-slate-400">{key}</span>
                    <span className="text-xs text-slate-700 text-right">{String(value)}</span>
                  </div>
                ))}
              </div>
            )}
            {currentContact.comments && (
              <div className="pt-2 border-t border-[#E2E8F0]">
                <p className="text-xs text-slate-500 mb-1">Previous Note</p>
                <p className="text-xs text-slate-600 italic">"{currentContact.comments}"</p>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-[#E2E8F0]">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Call Script</h4>
            {['Opening', 'Qualification', 'Pitch', 'Close'].map((section, i) => (
              <details key={section} className="mb-2" open={i === 0}>
                <summary className="text-xs font-medium text-slate-700 cursor-pointer py-1.5 px-2 rounded hover:bg-slate-50">{section}</summary>
                <div className="mt-1 px-2 py-2 bg-slate-50 rounded-lg text-xs text-slate-500 leading-relaxed">
                  {i === 0 && `Good morning! This is ${user?.display_name || '[Agent]'} calling from ProCaller. Am I speaking with ${displayName}?`}
                  {i === 1 && 'I wanted to follow up regarding your interest in our calling solution. Do you have 3 minutes?'}
                  {i === 2 && 'ProCaller includes manual and campaign dialing, WebRTC agent phones, and real-time operations.'}
                  {i === 3 && 'Shall we schedule a walkthrough with AP Infotech and Cyber Solution?'}
                </div>
              </details>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center bg-[#F8FAFC] p-8">
          {callState === 'idle' && (
            <div className="w-full max-w-sm">
              <Card className="p-6">
                <h3 className="text-sm font-semibold text-slate-700 mb-4 text-center">
                  {mode === 'manual' ? 'Enter Number' : 'Preview Mode'}
                </h3>
                <div className="bg-slate-50 rounded-xl px-4 py-3 mb-4 text-center">
                  {mode === 'manual' ? (
                    <input
                      ref={dialInputRef}
                      value={dialNumber}
                      onChange={(e) => setDialNumber(sanitizeDial(e.target.value))}
                      inputMode="tel"
                      autoComplete="tel"
                      autoFocus
                      placeholder="+91 ···"
                      className="w-full bg-transparent font-mono text-2xl text-slate-900 tracking-wider text-center min-h-[36px] focus:outline-none placeholder:text-slate-300"
                    />
                  ) : (
                    <p className="font-mono text-2xl text-slate-900 tracking-wider min-h-[36px]">{currentContact.phone}</p>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {keypadKeys.map((key) => (
                    <button type="button" key={key} onClick={() => pressKey(key)} className="h-12 rounded-xl bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-semibold text-lg transition-all duration-100 flex items-center justify-center">
                      {key}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  {mode === 'manual' && (
                    <button
                      type="button"
                      title="Delete last digit · hold to clear"
                      onMouseDown={onBackspaceDown}
                      onMouseUp={onBackspaceUp}
                      onMouseLeave={() => { if (backspaceTimer.current) { clearTimeout(backspaceTimer.current); backspaceTimer.current = null; } }}
                      onTouchStart={onBackspaceDown}
                      onTouchEnd={(e) => { e.preventDefault(); onBackspaceUp(); }}
                      className="h-12 w-12 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition-all"
                    >⌫</button>
                  )}
                  <button
                    type="button"
                    title="Call · double-tap to redial last number"
                    onClick={handleCallButton}
                    disabled={!phoneReady}
                    className="flex-1 h-12 rounded-xl bg-green-500 hover:bg-green-600 active:bg-green-700 text-white font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-green-200 disabled:opacity-50"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    Call
                  </button>
                  {mode !== 'manual' && (
                    <button
                      onClick={() => { loadNextLead(); }}
                      className="h-12 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium text-sm transition-all"
                    >
                      Skip →
                    </button>
                  )}
                </div>
                {mode === 'manual' && (
                  <p className="text-[11px] text-slate-400 text-center mt-3">
                    Type or paste a number · ⌫ deletes · hold ⌫ to clear · double-tap Call to redial
                  </p>
                )}
              </Card>
            </div>
          )}

          {(callState === 'initiating' || callState === 'ringing') && (
            <div className="text-center">
              <div className="relative w-28 h-28 mx-auto mb-6">
                <div className="absolute inset-0 rounded-full bg-[#4F46E5]/10 animate-ping" />
                <div className="absolute inset-2 rounded-full bg-[#4F46E5]/20 animate-ping" style={{ animationDelay: '0.3s' }} />
                <div className="w-28 h-28 rounded-full bg-[#4F46E5] flex items-center justify-center relative">
                  <Avatar initials={initials} size="lg" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-1">{displayName}</h2>
              <p className="text-slate-500 mb-1 font-mono tracking-wide">{displayPhone}</p>
              <p className="text-lg font-medium text-[#4F46E5] animate-calling">
                {callState === 'initiating' ? 'Calling...' : 'Ringing...'}
              </p>
              <button onClick={endCall} className="mt-8 w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-red-200 transition-all">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                </svg>
              </button>
            </div>
          )}

          {(callState === 'connected' || callState === 'on_hold') && (
            <div className="w-full max-w-sm text-center">
              <div className="w-24 h-24 rounded-full bg-green-500 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-200">
                <Avatar initials={initials} size="lg" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">{displayName}</h2>
              <p className="text-sm text-slate-500 font-mono tracking-wide mt-1">{displayPhone}</p>
              <p className="font-mono text-4xl font-bold text-slate-900 mt-4 tabular-nums tracking-wider">{timer}</p>
              <p className="text-xs font-medium mt-1">{onHold ? <span className="text-amber-600">On hold</span> : <span className="text-green-600">Connected</span>}</p>

              <div className="grid grid-cols-3 gap-4 mt-8 mb-6 max-w-xs mx-auto">
                {[
                  { label: muted ? 'Unmute' : 'Mute', icon: muted ? '🔊' : '🔇', active: muted, action: toggleMute },
                  { label: 'Keypad', icon: '⌨', active: showKeypad, action: () => setShowKeypad(!showKeypad) },
                  { label: onHold ? 'Resume' : 'Hold', icon: onHold ? '▶' : '⏸', active: onHold, action: toggleHold },
                ].map((ctrl) => (
                  <button key={ctrl.label} onClick={ctrl.action} className="flex flex-col items-center gap-2">
                    <span className={`w-14 h-14 rounded-full flex items-center justify-center text-xl transition-all ${ctrl.active ? 'bg-[#4F46E5] text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}>{ctrl.icon}</span>
                    <span className="text-[11px] font-medium text-slate-500">{ctrl.label}</span>
                  </button>
                ))}
              </div>

              {showKeypad && (
                <div className="mb-6 p-3 bg-white rounded-2xl border border-[#E2E8F0] max-w-xs mx-auto">
                  <p className="font-mono text-center text-sm text-slate-600 mb-2 min-h-[20px]">{dtmf}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {keypadKeys.map((key) => (
                      <button key={key} onClick={() => pressKey(key)} className="h-12 rounded-full bg-slate-100 hover:bg-slate-200 text-lg font-semibold text-slate-800 transition-all">{key}</button>
                    ))}
                  </div>
                </div>
              )}

              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note..."
                className="w-full text-sm rounded-xl border border-[#E2E8F0] p-3 resize-none h-16 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 mb-5"
              />

              <button onClick={endCall} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center mx-auto shadow-lg shadow-red-200 transition-all">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                </svg>
              </button>
              <p className="text-[11px] text-slate-400 mt-2">End call</p>
            </div>
          )}
        </div>

        <div className="w-72 border-l border-[#E2E8F0] bg-white overflow-y-auto shrink-0">
          <div className="p-4 border-b border-[#E2E8F0]">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer 360</h3>
          </div>
          <div className="p-4">
            <h4 className="text-xs font-semibold text-slate-500 mb-3">Live Call</h4>
            <div className="space-y-2 text-xs text-slate-600">
              <p>State: <span className="font-medium text-slate-800">{callState}</span></p>
              <p>Backend: <span className="font-medium text-slate-800">{phoneMode}</span></p>
              <p>Agent: <span className="font-medium text-slate-800">{user?.display_name}</span></p>
            </div>
          </div>
          {currentContact.extra_data && Object.keys(currentContact.extra_data).length > 0 && (
            <div className="p-4 border-t border-[#E2E8F0]">
              <h4 className="text-xs font-semibold text-slate-500 mb-2">Imported fields</h4>
              <div className="space-y-1.5">
                {Object.entries(currentContact.extra_data).map(([key, value]) => (
                  <p key={key} className="text-xs text-slate-600"><span className="text-slate-400">{key}:</span> {String(value)}</p>
                ))}
              </div>
            </div>
          )}
          {currentContact.comments && (
            <div className="p-4 border-t border-[#E2E8F0]">
              <h4 className="text-xs font-semibold text-slate-500 mb-2">Notes</h4>
              <p className="text-xs text-slate-600">{currentContact.comments}</p>
            </div>
          )}
        </div>
      </div>

      <Modal open={showDisposition} onClose={() => {}} title="Call Disposition" size="md">
        <div className="space-y-4">
          <div className="bg-slate-50 rounded-xl p-4 text-center">
            <p className="text-xs text-slate-500 mb-1">Call Duration</p>
            <p className="text-2xl font-bold font-mono text-slate-900">{activeCall?.duration || timer}</p>
            <p className="text-xs text-slate-400 mt-1">{displayName} · {displayPhone}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Outcome</p>
            <div className="grid grid-cols-2 gap-2">
              {dispositions.map((d) => (
                <button
                  key={d.key}
                  onClick={() => setSelectedDisposition(d.label)}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border text-sm font-medium transition-all text-left ${selectedDisposition === d.label ? 'border-[#4F46E5] bg-[#EEF2FF] text-[#4F46E5]' : 'border-[#E2E8F0] text-slate-700 hover:border-[#C7D2FE]'}`}
                >
                  <kbd className="w-5 h-5 flex items-center justify-center bg-slate-100 text-slate-400 rounded text-[10px] font-mono shrink-0">{d.key}</kbd>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add call notes..."
            className="w-full h-20 rounded-xl border border-[#E2E8F0] p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30"
          />
          <div className="flex gap-2">
            <input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className="flex-1 h-9 rounded-lg border border-[#E2E8F0] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30" />
            <input type="time" value={followUpTime} onChange={(e) => setFollowUpTime(e.target.value)} className="flex-1 h-9 rounded-lg border border-[#E2E8F0] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="md" className="flex-1" onClick={() => { setShowDisposition(false); setCallState('idle'); setActiveCall(null); callIdRef.current = null; }}>
              Skip
            </Button>
            <Button variant="primary" size="md" className="flex-1" onClick={saveDisposition} disabled={!selectedDisposition}>
              Save & Next Lead →
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
