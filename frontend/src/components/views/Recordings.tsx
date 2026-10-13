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

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function listedDuration(row: CallRecord) {
  const seconds = Number(row.duration_seconds || 0);
  if (seconds > 0) return seconds;
  const parts = String(row.duration || '').split(':').map(Number);
  if (parts.length === 2 && parts.every((n) => Number.isFinite(n))) return parts[0] * 60 + parts[1];
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

async function resolveMediaDuration(audio: HTMLAudioElement) {
  if (Number.isFinite(audio.duration) && audio.duration > 0) return audio.duration;
  await new Promise<void>((resolve) => {
    const finish = () => {
      audio.removeEventListener('timeupdate', finish);
      resolve();
    };
    audio.addEventListener('timeupdate', finish);
    try {
      audio.currentTime = 1e101;
    } catch {
      resolve();
    }
    window.setTimeout(finish, 400);
  });
  const length = audio.duration;
  try {
    audio.currentTime = 0;
  } catch {
    /* ignore */
  }
  return Number.isFinite(length) && length > 0 ? length : 0;
}

function SeekBar({
  ratio,
  onSeek,
  disabled,
}: {
  ratio: number;
  onSeek: (next: number) => void;
  disabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const pct = Math.min(100, Math.max(0, ratio * 100));

  const valueFromEvent = (event: React.PointerEvent) => {
    const track = trackRef.current;
    if (!track) return 0;
    const box = track.getBoundingClientRect();
    if (!box.width) return 0;
    return Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
  };

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label="Recording position"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      tabIndex={disabled ? -1 : 0}
      className={`relative h-8 flex-1 select-none touch-none ${disabled ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
      onPointerDown={(event) => {
        if (disabled) return;
        event.preventDefault();
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        onSeek(valueFromEvent(event));
      }}
      onPointerMove={(event) => {
        if (!dragging.current || disabled) return;
        onSeek(valueFromEvent(event));
      }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === 'ArrowRight') onSeek(Math.min(1, ratio + 0.02));
        if (event.key === 'ArrowLeft') onSeek(Math.max(0, ratio - 0.02));
        if (event.key === 'Home') onSeek(0);
        if (event.key === 'End') onSeek(1);
      }}
    >
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-slate-200 overflow-hidden">
        <div className="h-full rounded-full bg-[#4F46E5] transition-[width] duration-75" style={{ width: `${pct}%` }} />
      </div>
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-[2.5px] border-[#4F46E5] shadow-md pointer-events-none"
        style={{ left: `${pct}%` }}
      />
    </div>
  );
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
  const [paused, setPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cacheRef = useRef<Map<number, string>>(new Map());
  const scrubbing = useRef(false);

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
    audioRef.current?.pause();
    cacheRef.current.forEach((url) => URL.revokeObjectURL(url));
    cacheRef.current.clear();
  }, []);

  const allIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const allSelected = allIds.length > 0 && selected.length === allIds.length;
  const activeRow = rows.find((row) => row.id === playingId) || null;
  const knownLength = duration || (activeRow ? listedDuration(activeRow) : 0);
  const playRatio = knownLength > 0 ? Math.min(1, currentTime / knownLength) : 0;

  const toggleAll = () => setSelected(allSelected ? [] : allIds);
  const toggleOne = (id: number) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const bindAudio = (audio: HTMLAudioElement) => {
    audio.ontimeupdate = () => {
      if (!scrubbing.current) setCurrentTime(audio.currentTime || 0);
    };
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    };
    audio.onended = () => {
      setPaused(true);
      setCurrentTime(audio.duration || 0);
    };
    audio.onpause = () => setPaused(true);
    audio.onplay = () => setPaused(false);
  };

  const ensureAudio = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      bindAudio(audioRef.current);
    }
    return audioRef.current;
  };

  const loadRow = async (row: CallRecord) => {
    const audio = ensureAudio();
    let url = cacheRef.current.get(row.id);
    if (!url) {
      const { blob } = await apiBlob(`/api/recordings/${row.id}/file/`);
      url = URL.createObjectURL(blob);
      cacheRef.current.set(row.id, url);
    }
    if (audio.src !== url) {
      audio.src = url;
      audio.load();
      await new Promise<void>((resolve) => {
        const done = () => {
          audio.removeEventListener('loadedmetadata', done);
          audio.removeEventListener('canplay', done);
          resolve();
        };
        audio.addEventListener('loadedmetadata', done);
        audio.addEventListener('canplay', done);
        window.setTimeout(done, 1200);
      });
    }
    const mediaDuration = await resolveMediaDuration(audio);
    setDuration(mediaDuration || listedDuration(row));
    setPlayingId(row.id);
    return audio;
  };

  const listen = async (row: CallRecord) => {
    const audio = ensureAudio();
    if (playingId === row.id) {
      if (audio.paused) {
        try {
          await audio.play();
          setPaused(false);
        } catch (err) {
          showToast?.(err instanceof Error ? err.message : 'Could not play recording', 'error');
        }
      } else {
        audio.pause();
        setPaused(true);
      }
      return;
    }
    setLoadingId(row.id);
    try {
      audio.pause();
      const next = await loadRow(row);
      setCurrentTime(0);
      await next.play();
      setPaused(false);
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : 'Could not play recording', 'error');
    } finally {
      setLoadingId(null);
    }
  };

  const seekTo = async (row: CallRecord, ratio: number) => {
    scrubbing.current = true;
    const fallback = listedDuration(row);
    try {
      const audio = playingId === row.id ? ensureAudio() : await loadRow(row);
      const length = (Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration || fallback) || 0;
      if (length <= 0) {
        setCurrentTime(0);
        return;
      }
      const nextTime = Math.min(length, Math.max(0, ratio * length));
      audio.currentTime = nextTime;
      setCurrentTime(nextTime);
      setDuration(length);
      if (audio.paused) {
        await audio.play();
        setPaused(false);
      }
    } catch (err) {
      showToast?.(err instanceof Error ? err.message : 'Could not seek recording', 'error');
    } finally {
      window.setTimeout(() => { scrubbing.current = false; }, 80);
    }
  };

  const skip = async (seconds: number) => {
    if (!playingId) return;
    const row = rows.find((item) => item.id === playingId);
    if (!row) return;
    const length = knownLength || listedDuration(row) || 1;
    await seekTo(row, Math.min(1, Math.max(0, (currentTime + seconds) / length)));
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

  const playerBar = (row: CallRecord, compact = false) => {
    const active = playingId === row.id;
    const length = active ? knownLength : listedDuration(row);
    const position = active ? currentTime : 0;
    const ratio = active ? playRatio : 0;
    const isLoading = loadingId === row.id;
    return (
      <div className={`flex items-center gap-3 ${compact ? '' : 'mt-3 pt-3 border-t border-[#E2E8F0]'}`}>
        <button
          onClick={() => listen(row)}
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm transition-all ${active && !paused ? 'bg-[#4F46E5] text-white' : 'bg-slate-100 hover:bg-[#4F46E5] hover:text-white text-slate-600'}`}
          title={active && !paused ? 'Pause' : 'Play'}
        >
          {isLoading ? (
            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : active && !paused ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z" /></svg>
          ) : (
            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          )}
        </button>
        <button
          className="text-[11px] font-medium text-slate-500 hover:text-slate-800 px-1"
          onClick={() => skip(-5)}
          disabled={!active}
          title="Back 5 seconds"
        >
          -5s
        </button>
        <span className="w-10 text-right text-[11px] font-mono text-slate-500 tabular-nums">{formatClock(position)}</span>
        <SeekBar
          ratio={ratio}
          disabled={isLoading}
          onSeek={(next) => seekTo(row, next)}
        />
        <span className="w-10 text-[11px] font-mono text-slate-500 tabular-nums">{formatClock(length)}</span>
        <button
          className="text-[11px] font-medium text-slate-500 hover:text-slate-800 px-1"
          onClick={() => skip(5)}
          disabled={!active}
          title="Forward 5 seconds"
        >
          +5s
        </button>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#F8FAFC] fade-in">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-6 py-6 space-y-4 pb-4">
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
            <Card key={rec.id} className={`p-5 transition-all ${selected.includes(rec.id) ? 'border-[#4F46E5] bg-[#F8FAFF]' : ''} ${playingId === rec.id ? 'ring-1 ring-[#4F46E5]/30' : ''}`}>
              <div className="flex items-start gap-4">
                <input
                  type="checkbox"
                  className="mt-4 accent-[#4F46E5]"
                  checked={selected.includes(rec.id)}
                  onChange={() => toggleOne(rec.id)}
                />
                <button
                  onClick={() => listen(rec)}
                  className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-lg transition-all ${playingId === rec.id && !paused ? 'bg-[#4F46E5] shadow-indigo-200 text-white' : 'bg-slate-100 hover:bg-[#4F46E5] hover:text-white text-slate-600'}`}
                >
                  {loadingId === rec.id ? (
                    <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : playingId === rec.id && !paused ? (
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

                  {playerBar(rec)}
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  <Button variant="secondary" size="sm" onClick={() => listen(rec)}>
                    {playingId === rec.id && !paused ? 'Pause' : 'Listen'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => downloadOne(rec)}>Download</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {activeRow && (
        <div className="shrink-0 border-t border-[#E2E8F0] bg-white px-6 py-3">
          <div className="max-w-[1200px] mx-auto flex items-center gap-4">
            <div className="min-w-0 w-48">
              <p className="text-sm font-semibold text-slate-900 truncate">{activeRow.phone_number}</p>
              <p className="text-[11px] text-slate-400 truncate">{activeRow.user_name || activeRow.agent_name} · {activeRow.campaign_name || 'Manual'}</p>
            </div>
            <div className="flex-1 min-w-0">{playerBar(activeRow, true)}</div>
          </div>
        </div>
      )}
    </div>
  );
}
