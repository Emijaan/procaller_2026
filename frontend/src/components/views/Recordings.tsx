import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, Badge, Avatar, Button } from '../ui/index';
import { api, apiBlob, triggerDownload } from '../../api/client';
import type { CallRecord, Campaign, Organization, User } from '../../api/types';
import { useAuth } from '../../context/AuthContext';

const outcomeVariant = (status: string) => {
  const key = (status || '').toLowerCase();
  if (key.includes('connected') || key.includes('converted')) return 'success' as const;
  if (key.includes('no answer') || key.includes('busy') || key.includes('voicemail')) return 'warning' as const;
  if (key.includes('fail') || key.includes('cancel')) return 'danger' as const;
  return 'muted' as const;
};

function formatStamp(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatBytes(bytes?: number) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Recordings({ showToast }: { showToast?: (msg: string, type?: 'success' | 'info' | 'error') => void }) {
  const { user } = useAuth();
  const isSuper = (user?.role_normalized || user?.role) === 'super_admin';
  const [rows, setRows] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [agent, setAgent] = useState('');
  const [campaign, setCampaign] = useState('');
  const [agency, setAgency] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [outcome, setOutcome] = useState('');
  const [agents, setAgents] = useState<User[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [agencies, setAgencies] = useState<Organization[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => {
    api<User[]>('/api/staff/').then(setAgents).catch(() => undefined);
    api<Campaign[]>('/api/campaigns/').then(setCampaigns).catch(() => undefined);
    if (isSuper) api<Organization[]>('/api/agencies/').then(setAgencies).catch(() => undefined);
  }, [isSuper]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (agent) params.set('agent', agent);
    if (campaign) params.set('campaign', campaign);
    if (agency) params.set('agency', agency);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (outcome) params.set('outcome', outcome);
    try {
      const data = await api<{ count: number; results: CallRecord[] }>(`/api/recordings/?${params.toString()}`);
      setRows(data.results || []);
      setSelected([]);
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : 'Could not load recordings', 'error');
    } finally {
      setLoading(false);
    }
  }, [q, agent, campaign, agency, from, to, outcome]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    audioRef.current?.pause();
  }, []);

  const allIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const allSelected = allIds.length > 0 && selected.length === allIds.length;

  const toggleAll = () => setSelected(allSelected ? [] : allIds);
  const toggleOne = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const listen = async (row: CallRecord) => {
    if (playingId === row.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    try {
      const { blob } = await apiBlob(`/api/recordings/${row.id}/file/`);
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      const url = URL.createObjectURL(blob);
      objectUrl.current = url;
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      audioRef.current.onended = () => setPlayingId(null);
      await audioRef.current.play();
      setPlayingId(row.id);
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : 'Could not play recording', 'error');
    }
  };

  const downloadOne = async (row: CallRecord) => {
    try {
      const { blob, filename } = await apiBlob(`/api/recordings/${row.id}/file/?download=1`);
      triggerDownload(blob, filename);
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : 'Download failed', 'error');
    }
  };

  const downloadBulk = async () => {
    const ids = selected.length ? selected : allIds;
    if (!ids.length) {
      showToast?.('No recordings to download', 'info');
      return;
    }
    setBusy(true);
    try {
      const { blob, filename } = await apiBlob('/api/recordings/export/', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      triggerDownload(blob, filename || 'procaller-recordings.zip');
      showToast?.(`Downloaded ${ids.length} recording${ids.length === 1 ? '' : 's'}`, 'success');
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : 'Bulk download failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#F8FAFC] fade-in">
      <div className="max-w-[1200px] mx-auto px-6 py-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search phone, name, campaign..."
            className="h-9 w-56 rounded-lg border border-[#E2E8F0] bg-white text-sm px-3 text-slate-600 focus:outline-none"
          />
          <select value={agent} onChange={(e) => setAgent(e.target.value)} className="h-9 rounded-lg border border-[#E2E8F0] bg-white text-sm px-3 text-slate-600 focus:outline-none">
            <option value="">All users</option>
            {agents.map((person) => (
              <option key={person.id} value={person.id}>{person.display_name}</option>
            ))}
          </select>
          <select value={campaign} onChange={(e) => setCampaign(e.target.value)} className="h-9 rounded-lg border border-[#E2E8F0] bg-white text-sm px-3 text-slate-600 focus:outline-none">
            <option value="">All campaigns</option>
            {campaigns.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
          {isSuper && (
            <select value={agency} onChange={(e) => setAgency(e.target.value)} className="h-9 rounded-lg border border-[#E2E8F0] bg-white text-sm px-3 text-slate-600 focus:outline-none">
              <option value="">All agencies</option>
              {agencies.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          )}
          <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="h-9 rounded-lg border border-[#E2E8F0] bg-white text-sm px-3 text-slate-600 focus:outline-none">
            <option value="">All outcomes</option>
            <option>Connected</option>
            <option>No Answer</option>
            <option>Busy</option>
            <option>Failed</option>
            <option>Cancelled</option>
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-[#E2E8F0] px-3 text-sm focus:outline-none" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-[#E2E8F0] px-3 text-sm focus:outline-none" />
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={toggleAll}>{allSelected ? 'Clear' : 'Select all'}</Button>
            <Button variant="primary" size="sm" onClick={downloadBulk} disabled={busy || !rows.length}>
              {busy ? 'Preparing zip…' : `Download ${selected.length || rows.length} as ZIP`}
            </Button>
          </div>
        </div>

        {loading && <p className="text-sm text-slate-500 px-1">Loading recordings…</p>}
        {!loading && !rows.length && (
          <Card className="p-8 text-center text-sm text-slate-500">No recordings yet. Every call is saved from the first ring.</Card>
        )}

        {rows.map((rec) => (
          <Card key={rec.id} className={`p-5 transition-all ${selected.includes(rec.id) ? 'border-[#4F46E5] bg-[#F8FAFF]' : ''}`}>
            <div className="flex items-start gap-4">
              <input
                type="checkbox"
                className="mt-4 accent-[#4F46E5]"
                checked={selected.includes(rec.id)}
                onChange={() => toggleOne(rec.id)}
              />
              <button
                onClick={() => listen(rec)}
                className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-lg transition-all ${playingId === rec.id ? 'bg-[#4F46E5] shadow-indigo-200 text-white' : 'bg-slate-100 hover:bg-[#4F46E5] hover:text-white text-slate-600'}`}
              >
                {playingId === rec.id ? (
                  <div className="flex gap-0.5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span key={i} className="wave-bar h-4 bg-white" style={{ animationDelay: `${i * 0.1}s` }} />
                    ))}
                  </div>
                ) : (
                  <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar initials={rec.initials || '?'} size="sm" />
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{rec.phone_number}</p>
                      <p className="text-xs text-slate-400">{rec.customer !== rec.phone_number ? rec.customer : 'Manual dial'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={outcomeVariant(rec.status || rec.outcome)}>{rec.status || rec.outcome || 'Saved'}</Badge>
                    <span className="text-xs font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded">{rec.duration || '00:00'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5 text-xs text-slate-600">
                  <p><span className="text-slate-400">Date / time</span><br /><span className="font-medium text-slate-800">{formatStamp(rec.started_at || rec.date)}</span></p>
                  <p><span className="text-slate-400">Campaign</span><br /><span className="font-medium text-slate-800">{rec.campaign_name || '—'}</span></p>
                  <p><span className="text-slate-400">Campaign ID</span><br /><span className="font-medium text-slate-800">{rec.campaign_id ?? rec.campaign ?? '—'}</span></p>
                  <p><span className="text-slate-400">Agency</span><br /><span className="font-medium text-slate-800">{rec.agency_name || '—'}</span></p>
                  <p><span className="text-slate-400">User</span><br /><span className="font-medium text-slate-800">{rec.user_name || rec.agent_name}</span></p>
                  <p><span className="text-slate-400">File</span><br /><span className="font-medium text-slate-800">{formatBytes(rec.recording_bytes)}</span></p>
                </div>
              </div>

              <div className="flex flex-col gap-2 shrink-0">
                <Button variant="secondary" size="sm" onClick={() => listen(rec)}>{playingId === rec.id ? 'Pause' : 'Listen'}</Button>
                <Button variant="ghost" size="sm" onClick={() => downloadOne(rec)}>Download</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
