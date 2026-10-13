import React, { useEffect, useState } from 'react';
import { Card, Badge, Button, ProgressBar, Modal } from '../ui/index';
import { api } from '../../api/client';
import type { Campaign, User } from '../../api/types';
import { can } from '../../api/access';
import { useAuth } from '../../context/AuthContext';

const statusVariant = (s: string): 'success' | 'warning' | 'danger' | 'muted' | 'info' | 'default' | 'purple' => {
  const m: Record<string, 'success' | 'warning' | 'danger' | 'muted' | 'info' | 'default' | 'purple'> = {
    Running: 'success', running: 'success', active: 'success', Active: 'success',
    Paused: 'warning', paused: 'warning', Draft: 'muted', draft: 'muted',
    Completed: 'info', completed: 'info', Archived: 'muted', archived: 'muted',
  };
  return m[s] || 'muted';
};

function prettyStatus(s: string) {
  return (s || 'draft').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

type CampaignLead = {
  id: number;
  name: string;
  phone: string;
  lead_status?: string;
  last_disposition?: string;
  tts_status?: string;
  tts_error?: string;
  extra_data?: Record<string, string>;
  attempt_count?: number;
  last_agent?: string;
  last_outcome?: string;
  last_duration?: string;
  calls?: { id: number; agent: string; outcome: string; disposition: string; duration: string; started_at: string }[];
};

type LeadBoard = { columns: string[]; mobile_column: string; leads: CampaignLead[] };

type Preview = {
  job_id: number;
  headers: string[];
  mobile_column: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  preview: Record<string, string>[];
} | null;

export default function Campaigns({ showToast }: { showToast: (msg: string, type?: 'success' | 'info' | 'error') => void }) {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [agents, setAgents] = useState<User[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState({ name: '', description: '', dial_method: 'power', code: '', wrap_up_seconds: '30', dial_ratio: '1', campaign_type: 'live', tts_prompt: '' });
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [assigned, setAssigned] = useState<number[]>([]);
  const [assignCamp, setAssignCamp] = useState<Campaign | null>(null);
  const [assignIds, setAssignIds] = useState<number[]>([]);
  const [assignBusy, setAssignBusy] = useState(false);
  const [preview, setPreview] = useState<Preview>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState('');
  const [tab, setTab] = useState('all');
  const [leadCamp, setLeadCamp] = useState<Campaign | null>(null);
  const [leadBoard, setLeadBoard] = useState<LeadBoard | null>(null);
  const [openLead, setOpenLead] = useState<number | null>(null);
  const totalSteps = 6;
  const steps = ['Details', 'Import Leads', 'Assign Agents', 'Dialing Strategy', 'Schedule', 'Review'];

  const load = () => api<Campaign[]>('/api/campaigns/').then(setCampaigns).catch((err) => showToast(err.message, 'error'));
  useEffect(() => {
    load();
    api<User[]>('/api/staff/?role=user').then(setAgents).catch(() => undefined);
  }, []);

  const uploadHold = async (id: number, file: File) => {
    if (!file.name.toLowerCase().endsWith('.mp3')) {
      showToast('Hold audio must be an MP3', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Hold audio must be 5MB or smaller', 'error');
      return;
    }
    const token = localStorage.getItem('procaller.access') || '';
    const body = new FormData();
    body.append('file', file);
    try {
      await fetch(`/api/campaigns/${id}/hold-audio/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).detail || 'Upload failed');
      });
      showToast('Hold audio saved for this campaign', 'success');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    }
  };

  const resetWizard = () => {
    setShowCreate(false);
    setStep(1);
    setCreatedId(null);
    setPreview(null);
    setPendingFile(null);
    setImportResult('');
    setAssigned([]);
    setDraft({ name: '', description: '', dial_method: 'power', code: '', wrap_up_seconds: '30', dial_ratio: '1', campaign_type: 'live', tts_prompt: '' });
  };

  const createCampaign = async () => {
    const camp = await api<Campaign>('/api/campaigns/', {
      method: 'POST',
      body: JSON.stringify({
        name: draft.name,
        description: draft.description,
        dial_method: draft.dial_method,
        code: draft.code,
        wrap_up_seconds: Number(draft.wrap_up_seconds) || 30,
        dial_ratio: Math.min(32, Math.max(1, Number(draft.dial_ratio) || 1)),
        campaign_type: draft.campaign_type,
        tts_prompt: draft.tts_prompt,
        tts_voice: 'en_US-lessac-low',
        status: 'draft',
      }),
    });
    setCreatedId(camp.id);
    return camp;
  };

  const ensureCampaign = async () => {
    if (createdId) return createdId;
    const camp = await createCampaign();
    return camp.id;
  };

  const previewExcel = async (file: File) => {
    const id = await ensureCampaign();
    const token = localStorage.getItem('procaller.access') || '';
    const body = new FormData();
    body.append('file', file);
    const data = await fetch(`/api/campaigns/${id}/import/preview/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json()).detail || 'Preview failed');
      return r.json();
    });
    setPendingFile(file);
    setPreview(data);
    showToast(`${data.valid_rows} valid · ${data.invalid_rows} invalid · ${data.duplicate_rows} duplicate`, 'info');
  };

  const downloadIbr = async (camp: Campaign) => {
    const token = localStorage.getItem('procaller.access') || '';
    const res = await fetch(`/api/reports/export/?kind=ibr&file=csv&campaign=${camp.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      let detail = 'Report download failed';
      try { detail = (await res.json()).detail || detail; } catch { /* CSV errors still throw below */ }
      throw new Error(detail);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${camp.name || 'ibr'}-report.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const confirmExcel = async () => {
    if (!pendingFile || !preview) return;
    const id = await ensureCampaign();
    const threads = Math.min(32, Math.max(1, Number(draft.dial_ratio) || 1));
    if (draft.campaign_type === 'ibr') {
      await api(`/api/campaigns/${id}/`, { method: 'PATCH', body: JSON.stringify({ tts_prompt: draft.tts_prompt, dial_ratio: threads }) });
    }
    const token = localStorage.getItem('procaller.access') || '';
    const body = new FormData();
    body.append('file', pendingFile);
    body.append('job_id', String(preview.job_id));
    body.append('dial_threads', String(threads));
    const result = await fetch(`/api/campaigns/${id}/import/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json()).detail || 'Import failed');
      return r.json();
    });
    const speech = result.speech === 'started'
      ? `Approved ${result.imported} numbers. Speech is generating and ${result.threads} threads will dial.`
      : `Imported ${result.imported} leads`;
    setImportResult(speech);
    showToast(speech, 'success');
    load();
  };

  const uploadAutoFile = async (camp: Campaign, file: File) => {
    const token = localStorage.getItem('procaller.access') || '';
    const previewBody = new FormData();
    previewBody.append('file', file);
    const data = await fetch(`/api/campaigns/${camp.id}/import/preview/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: previewBody,
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json()).detail || 'Preview failed');
      return r.json();
    });
    if (!data.valid_rows) throw new Error('No valid rows to import');
    const confirmBody = new FormData();
    confirmBody.append('file', file);
    confirmBody.append('job_id', String(data.job_id));
    confirmBody.append('dial_threads', String(Math.min(32, Math.max(1, camp.dial_ratio || 1))));
    const result = await fetch(`/api/campaigns/${camp.id}/import/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: confirmBody,
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json()).detail || 'Import failed');
      return r.json();
    });
    showToast(
      camp.campaign_type === 'ibr'
        ? `Approved ${result.imported} numbers. Speech is generating and ${result.threads || camp.dial_ratio || 1} threads will dial.`
        : `Imported ${result.imported} numbers · ${camp.dial_ratio || 1} threads`,
      'success',
    );
    load();
  };

  const openLeads = async (camp: Campaign) => {
    setLeadCamp(camp);
    setOpenLead(null);
    try {
      const board = await api<LeadBoard>(`/api/campaigns/${camp.id}/leads/`);
      setLeadBoard(board);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not load leads', 'error');
    }
  };

  const setStatus = async (camp: Campaign, status: string) => {
    try {
      await api(`/api/campaigns/${camp.id}/`, { method: 'PATCH', body: JSON.stringify({ status }) });
      showToast(`${camp.name} ${status}`, 'success');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  const visible = campaigns.filter((c) => {
    if (tab === 'ibr') return c.campaign_type === 'ibr';
    if (tab === 'all') return true;
    if (tab === 'active') return c.status === 'active' || c.status === 'running';
    return c.status === tab;
  });
  const tabs = [
    { label: 'All', id: 'all', count: campaigns.length },
    { label: 'Running', id: 'running', count: campaigns.filter((c) => c.status === 'running' || c.status === 'active').length },
    { label: 'Paused', id: 'paused', count: campaigns.filter((c) => c.status === 'paused').length },
    { label: 'Draft', id: 'draft', count: campaigns.filter((c) => c.status === 'draft').length },
  ];
  if (campaigns.some((c) => c.campaign_type === 'ibr') || user?.organization?.ibr_enabled) {
    tabs.splice(1, 0, { label: 'IBR', id: 'ibr', count: campaigns.filter((c) => c.campaign_type === 'ibr').length });
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#F8FAFC] fade-in">
      <div className="max-w-[1200px] mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {tabs.map((item) => (
              <button key={item.id} onClick={() => setTab(item.id === 'running' ? 'active' : item.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white border transition-all ${tab === item.id || (item.id === 'running' && tab === 'active') ? 'border-[#4F46E5] text-[#4F46E5]' : 'border-[#E2E8F0] text-slate-600 hover:border-[#4F46E5]/30'}`}>
                {item.label}
                <span className="bg-slate-100 text-slate-500 text-xs px-1.5 py-0.5 rounded-full">{item.count}</span>
              </button>
            ))}
          </div>
          {can(user, 'create_campaign') && <Button variant="primary" size="md" onClick={() => setShowCreate(true)}>+ New Campaign</Button>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map((camp) => (
            <Card key={camp.id} className="p-5 hover:shadow-md cursor-pointer transition-all">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-slate-900 text-base">{camp.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{camp.campaign_type === 'ibr' ? 'IBR · ' : ''}{camp.dial_method}{camp.auto_running ? ' · auto on' : ''} · wrap {camp.wrap_up_seconds ?? 30}s · {camp.dial_ratio ?? 1} threads · {camp.lead_count || 0} leads</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(camp.status)} dot={camp.status === 'running' || camp.status === 'active'}>{prettyStatus(camp.status)}</Badge>
                  <button className="text-slate-300 hover:text-slate-500 transition-colors">⋯</button>
                </div>
              </div>
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                  <span>{camp.lead_count || 0} leads</span>
                  <span>{camp.assigned_count || 0} users</span>
                </div>
                <ProgressBar value={0} max={Math.max(camp.lead_count || 1, 1)} />
                <p className="text-[10px] text-slate-400 mt-1">{camp.agency_name || 'Agency'} · {camp.admin_name || camp.manager_name || ''}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Strategy', value: camp.dial_method, color: 'text-indigo-600' },
                  { label: 'Leads', value: camp.lead_count || 0, color: 'text-slate-900' },
                  { label: 'Admin', value: camp.admin_name || '—', color: 'text-purple-600' },
                ].map((m) => (
                  <div key={m.label} className="bg-slate-50 rounded-lg p-2 text-center">
                    <p className={`text-sm font-bold ${m.color}`}>{m.value}</p>
                    <p className="text-[10px] text-slate-400">{m.label}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[#E2E8F0]">
                {can(user, 'edit_campaign') && (camp.status === 'running' || camp.status === 'active') && (
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => setStatus(camp, 'paused')}>⏸ Pause</Button>
                )}
                {can(user, 'edit_campaign') && camp.status === 'paused' && (
                  <Button variant="primary" size="sm" className="flex-1" onClick={() => setStatus(camp, 'active')}>▶ Resume</Button>
                )}
                {can(user, 'edit_campaign') && camp.status === 'draft' && (
                  <Button variant="primary" size="sm" className="flex-1" onClick={() => setStatus(camp, 'active')}>🚀 Launch</Button>
                )}
                {can(user, 'import_leads') && !camp.auto_running && (camp.status === 'active' || camp.status === 'running') && (
                  <Button variant="primary" size="sm" className="flex-1" onClick={() => api(`/api/campaigns/${camp.id}/`, { method: 'PATCH', body: JSON.stringify({ auto_running: true, dial_method: camp.campaign_type === 'ibr' ? camp.dial_method : 'power', status: 'running', dial_ratio: Math.min(32, Math.max(1, camp.dial_ratio || 1)) }) }).then(() => { showToast(camp.campaign_type === 'ibr' ? 'IBR threads started' : 'Auto dial started', 'success'); load(); }).catch((err) => showToast(err.message, 'error'))}>{camp.campaign_type === 'ibr' ? 'Start threads' : 'Start auto'}</Button>
                )}
                {can(user, 'import_leads') && camp.auto_running && (
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => api(`/api/campaigns/${camp.id}/`, { method: 'PATCH', body: JSON.stringify({ auto_running: false }) }).then(() => { showToast('Auto dial stopped', 'success'); load(); }).catch((err) => showToast(err.message, 'error'))}>Stop auto</Button>
                )}
                {camp.campaign_type === 'ibr' && can(user, 'edit_campaign') && (
                  <Button variant="secondary" size="sm" onClick={() => api(`/api/campaigns/${camp.id}/tts/`, { method: 'POST', body: '{}' }).then((res) => { const row = res as { ready?: number; failed?: number }; showToast(`Speech ready ${row.ready || 0}, failed ${row.failed || 0}`, row.failed ? 'info' : 'success'); }).catch((err) => showToast(err.message, 'error'))}>Regenerate speech</Button>
                )}
                {camp.campaign_type === 'ibr' && can(user, 'view_reports') && (
                  <Button variant="outline" size="sm" onClick={() => downloadIbr(camp).catch((err) => showToast(err.message, 'error'))}>Download report</Button>
                )}
                <Button variant="outline" size="sm" onClick={() => openLeads(camp).catch(() => undefined)}>Leads</Button>
                {can(user, 'edit_campaign') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setAssignCamp(camp);
                      setAssignIds(camp.assigned_users || []);
                    }}
                  >
                    Assign users
                  </Button>
                )}
                {can(user, 'edit_campaign') && (
                  <label className="h-8 px-3 inline-flex items-center rounded-lg border border-[#E2E8F0] text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer">
                    🎵 Hold MP3
                    <input
                      type="file"
                      accept="audio/mpeg,.mp3"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) uploadHold(camp.id, file);
                      }}
                    />
                  </label>
                )}
              </div>
              {can(user, 'import_leads') && (
                <div className="flex items-center gap-2 mt-3">
                  <label className="text-[10px] text-slate-500 shrink-0">Threads</label>
                  <input
                    type="number"
                    min={1}
                    max={32}
                    defaultValue={camp.dial_ratio || 1}
                    key={`${camp.id}-${camp.dial_ratio}`}
                    className="w-16 h-8 rounded-lg border border-[#E2E8F0] px-2 text-xs"
                    onBlur={(e) => {
                      const threads = Math.min(32, Math.max(1, Number(e.target.value) || 1));
                      api(`/api/campaigns/${camp.id}/`, { method: 'PATCH', body: JSON.stringify({ dial_ratio: threads }) }).then(load).catch((err) => showToast(err.message, 'error'));
                    }}
                  />
                  <label className="h-8 px-3 inline-flex items-center rounded-lg border border-[#E2E8F0] text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer">
                    {camp.campaign_type === 'ibr' ? 'Approve file' : 'Upload Excel'}
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (file) uploadAutoFile(camp, file).catch((err) => showToast(err.message, 'error'));
                      }}
                    />
                  </label>
                </div>
              )}
              <p className="text-[10px] text-slate-400 mt-2">
                Hold audio: {camp.has_hold_audio ? (camp.hold_audio_name || 'Uploaded MP3') : 'Default tone · MP3 up to 5MB'}
                {camp.campaign_type === 'ibr' ? ' · An answered call plays that number’s WAV, then hangs up.' : camp.auto_running ? ' · Answered calls go to users seated in Preview Auto.' : ''}
              </p>
            </Card>
          ))}
        </div>
      </div>

      <Modal open={showCreate} onClose={resetWizard} title="New Campaign" size="lg">
        <div className="space-y-6">
          <div className="flex items-center gap-1">
            {steps.map((s, i) => (
              <React.Fragment key={s}>
                <div className={`flex items-center gap-1.5 ${i < step - 1 ? 'text-[#4F46E5]' : i === step - 1 ? 'text-[#4F46E5] font-semibold' : 'text-slate-300'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i < step - 1 ? 'bg-[#4F46E5] text-white' : i === step - 1 ? 'bg-[#EEF2FF] text-[#4F46E5] border-2 border-[#4F46E5]' : 'bg-slate-100 text-slate-400'}`}>
                    {i < step - 1 ? '✓' : i + 1}
                  </div>
                  <span className="text-xs hidden sm:inline">{s}</span>
                </div>
                {i < steps.length - 1 && <div className={`flex-1 h-0.5 ${i < step - 1 ? 'bg-[#4F46E5]' : 'bg-slate-100'}`} />}
              </React.Fragment>
            ))}
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700">Campaign Details</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Campaign Name</label>
                  <input className="w-full h-9 rounded-lg border border-[#E2E8F0] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30" placeholder="e.g. September Collection" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Campaign Code</label>
                  <input className="w-full h-9 rounded-lg border border-[#E2E8F0] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30" placeholder="e.g. DEL-REC" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
                </div>
                {user?.organization?.ibr_enabled && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Campaign type</label>
                    <select className="w-full h-9 rounded-lg border border-[#E2E8F0] px-3 text-sm" value={draft.campaign_type} onChange={(e) => setDraft({ ...draft, campaign_type: e.target.value })}>
                      <option value="live">Live agent</option>
                      <option value="ibr">IBR broadcast</option>
                    </select>
                  </div>
                )}
                {draft.campaign_type === 'ibr' && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Speech prompt</label>
                    <textarea className="w-full h-20 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm resize-none" placeholder="Hello {{customer_name}}, your outstanding loan amount is {{loan_amount}} rupees." value={draft.tts_prompt} onChange={(e) => setDraft({ ...draft, tts_prompt: e.target.value })} />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
                  <textarea className="w-full h-20 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30" placeholder="What is this campaign about?" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700">Import Leads</h3>
              <label className="border-2 border-dashed border-[#E2E8F0] rounded-xl p-10 text-center hover:border-[#4F46E5]/40 transition-colors cursor-pointer block">
                <div className="text-3xl mb-2">📊</div>
                <p className="text-sm font-medium text-slate-700">Drop Excel file or click to browse</p>
                <p className="text-xs text-slate-400 mt-1">{draft.campaign_type === 'ibr' ? 'Approving builds one WAV per number from its columns and dials that many threads.' : 'CSV or Excel. Mobile is mandatory. Other columns are stored dynamically.'}</p>
                {importResult && <p className="text-xs text-green-600 mt-2">{importResult}</p>}
                <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) previewExcel(file).catch((err) => showToast(err.message, 'error'));
                }} />
              </label>
              {preview && (
                <div className="rounded-xl border border-[#E2E8F0] p-4 space-y-3">
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div><p className="text-sm font-bold">{preview.total_rows}</p><p className="text-[10px] text-slate-400">Total</p></div>
                    <div><p className="text-sm font-bold text-green-600">{preview.valid_rows}</p><p className="text-[10px] text-slate-400">Valid</p></div>
                    <div><p className="text-sm font-bold text-amber-600">{preview.invalid_rows}</p><p className="text-[10px] text-slate-400">Invalid</p></div>
                    <div><p className="text-sm font-bold text-slate-600">{preview.duplicate_rows}</p><p className="text-[10px] text-slate-400">Duplicates</p></div>
                  </div>
                  <p className="text-xs text-slate-500">Mobile column: {preview.mobile_column}</p>
                  <Button variant="primary" size="sm" onClick={() => confirmExcel().catch((err) => showToast(err.message, 'error'))}>{draft.campaign_type === 'ibr' ? 'Approve file' : 'Confirm import'}</Button>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700">Assign Agents</h3>
              {agents.length === 0 && <p className="text-sm text-slate-400">No users in your scope yet.</p>}
              {agents.map((agent) => (
                <label key={agent.id} className="flex items-center gap-3 p-3 rounded-xl border border-[#E2E8F0] cursor-pointer hover:bg-slate-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={assigned.includes(agent.id)}
                    onChange={() => setAssigned((prev) => prev.includes(agent.id) ? prev.filter((id) => id !== agent.id) : [...prev, agent.id])}
                    className="rounded accent-[#4F46E5]"
                  />
                  <span className="text-sm font-medium text-slate-700">{agent.display_name}</span>
                  <span className="ml-auto text-xs text-slate-400">{agent.team || 'Available'}</span>
                </label>
              ))}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700">Dialing Strategy</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'power', label: 'Campaign auto', desc: 'Dial N numbers at once. Each answered call goes to one user seated in the campaign.' },
                  { id: 'preview', label: 'Preview Auto', desc: 'Each user dials their own ratio from the campaign list' },
                  { id: 'manual', label: 'Manual', desc: 'Agent manually initiates each call' },
                  { id: 'progressive', label: 'Progressive', desc: 'Coming later — not enabled yet' },
                ].map((mode) => (
                  <label key={mode.id} className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${draft.dial_method === mode.id ? 'border-[#4F46E5] bg-[#EEF2FF]' : 'border-[#E2E8F0] hover:border-[#4F46E5]/40'} ${mode.id === 'progressive' ? 'opacity-60' : ''}`}>
                    <input
                      type="radio"
                      name="mode"
                      value={mode.id}
                      disabled={mode.id === 'progressive'}
                      checked={draft.dial_method === mode.id}
                      onChange={() => setDraft({ ...draft, dial_method: mode.id })}
                      className="mt-0.5 accent-[#4F46E5]"
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{mode.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{mode.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Wrap-up seconds after hangup</label>
                  <input type="number" min={0} className="w-32 h-9 rounded-lg border border-[#E2E8F0] px-3 text-sm focus:outline-none" value={draft.wrap_up_seconds} onChange={(e) => setDraft({ ...draft, wrap_up_seconds: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">{draft.campaign_type === 'ibr' || draft.dial_method === 'power' ? 'Threads at once (1–32)' : 'Dial ratio (1–32)'}</label>
                  <input type="number" min={1} max={32} className="w-32 h-9 rounded-lg border border-[#E2E8F0] px-3 text-sm focus:outline-none" value={draft.dial_ratio} onChange={(e) => setDraft({ ...draft, dial_ratio: e.target.value })} />
                </div>
              </div>
            </div>
          )}

          {step >= 5 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700">{step === 5 ? 'Schedule' : 'Review & Launch'}</h3>
              {step === 5 ? (
                <div className="space-y-3">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((day) => (
                    <div key={day} className="flex items-center gap-3">
                      <span className="text-sm text-slate-600 w-10">{day}</span>
                      <input type="time" defaultValue="09:00" className="h-8 rounded-lg border border-[#E2E8F0] px-2 text-sm focus:outline-none" />
                      <span className="text-slate-400">—</span>
                      <input type="time" defaultValue="18:00" className="h-8 rounded-lg border border-[#E2E8F0] px-2 text-sm focus:outline-none" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
                  <div className="text-3xl mb-2">🚀</div>
                  <p className="text-sm font-semibold text-green-800">{draft.name || 'Campaign'} · {draft.dial_method} · ratio {draft.dial_ratio}</p>
                  <p className="text-xs text-green-600 mt-1">{importResult || 'Launch when you are ready'}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="md" onClick={() => step > 1 ? setStep((p) => p - 1) : resetWizard()}>
              {step > 1 ? '← Back' : 'Cancel'}
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={async () => {
                try {
                  const id = await ensureCampaign();
                  if (step === 3) {
                    await api(`/api/campaigns/${id}/`, { method: 'PATCH', body: JSON.stringify({ assigned_users: assigned }) });
                  }
                  if (step === 4) {
                    await api(`/api/campaigns/${id}/`, { method: 'PATCH', body: JSON.stringify({ dial_method: draft.dial_method, wrap_up_seconds: Number(draft.wrap_up_seconds) || 30, dial_ratio: Math.min(32, Math.max(1, Number(draft.dial_ratio) || 1)), code: draft.code }) });
                  }
                  if (step < totalSteps) {
                    setStep((p) => p + 1);
                  } else {
                    const threads = Math.min(32, Math.max(1, Number(draft.dial_ratio) || 1));
                    const ibr = draft.campaign_type === 'ibr';
                    await api(`/api/campaigns/${id}/`, { method: 'PATCH', body: JSON.stringify({ status: ibr || draft.dial_method === 'power' ? 'running' : 'active', dial_method: draft.dial_method, auto_running: ibr || draft.dial_method === 'power', assigned_users: assigned, wrap_up_seconds: Number(draft.wrap_up_seconds) || 30, dial_ratio: threads, code: draft.code }) });
                    showToast('Campaign saved', 'success');
                    resetWizard();
                    load();
                  }
                } catch (err) {
                  showToast(err instanceof Error ? err.message : 'Save failed', 'error');
                }
              }}
            >
              {step < totalSteps ? 'Continue →' : '🚀 Launch Campaign'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!assignCamp} onClose={() => setAssignCamp(null)} title={`Assign users · ${assignCamp?.name || ''}`}>
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Users assigned here can use manual and auto calling on this campaign.</p>
          {agents.length === 0 && <p className="text-sm text-slate-400">No users available to assign.</p>}
          <div className="max-h-72 overflow-y-auto space-y-1">
            {agents.map((agent) => {
              const checked = assignIds.includes(agent.id);
              return (
                <label key={agent.id} className="flex items-center gap-3 p-3 rounded-xl border border-[#E2E8F0] cursor-pointer hover:bg-slate-50">
                  <input
                    type="checkbox"
                    className="accent-[#4F46E5]"
                    checked={checked}
                    onChange={() => setAssignIds((prev) => checked ? prev.filter((id) => id !== agent.id) : [...prev, agent.id])}
                  />
                  <span className="text-sm font-medium text-slate-800">{agent.display_name}</span>
                  <span className="ml-auto text-xs text-slate-400">{agent.email}</span>
                </label>
              );
            })}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAssignCamp(null)}>Cancel</Button>
            <Button
              variant="primary"
              loading={assignBusy}
              onClick={async () => {
                if (!assignCamp) return;
                setAssignBusy(true);
                try {
                  await api(`/api/campaigns/${assignCamp.id}/`, { method: 'PATCH', body: JSON.stringify({ assigned_users: assignIds }) });
                  showToast('Users assigned', 'success');
                  setAssignCamp(null);
                  load();
                } catch (err) {
                  showToast(err instanceof Error ? err.message : 'Could not assign users', 'error');
                } finally {
                  setAssignBusy(false);
                }
              }}
            >
              Save assignment
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!leadCamp} onClose={() => { setLeadCamp(null); setLeadBoard(null); }} title={`Leads · ${leadCamp?.name || ''}`} size="xl">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">Same uploaded rows. Call status, duration, agent and disposition update here. Other columns stay as uploaded.</p>
            {leadCamp?.campaign_type === 'ibr' && can(user, 'view_reports') && (
              <Button variant="outline" size="sm" onClick={() => downloadIbr(leadCamp).catch((err) => showToast(err.message, 'error'))}>Download report</Button>
            )}
          </div>
          <div className="overflow-auto max-h-[28rem] border border-[#E2E8F0] rounded-xl">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-slate-500 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Lead</th>
                  <th className="text-left px-3 py-2 font-medium">{leadBoard?.mobile_column || 'Mobile'}</th>
                  {(leadBoard?.columns || []).map((col) => (
                    <th key={col} className="text-left px-3 py-2 font-medium">{col}</th>
                  ))}
                  {leadCamp?.campaign_type === 'ibr' && <th className="text-left px-3 py-2 font-medium">Speech</th>}
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Duration</th>
                  <th className="text-left px-3 py-2 font-medium">Agent</th>
                  <th className="text-left px-3 py-2 font-medium">Disposition</th>
                  <th className="text-left px-3 py-2 font-medium">Attempts</th>
                </tr>
              </thead>
              <tbody>
                {(leadBoard?.leads || []).map((lead) => (
                  <React.Fragment key={lead.id}>
                    <tr className="border-t border-[#E2E8F0] cursor-pointer hover:bg-slate-50" onClick={() => setOpenLead(openLead === lead.id ? null : lead.id)}>
                      <td className="px-3 py-2 font-mono text-slate-500">#{lead.id}</td>
                      <td className="px-3 py-2 font-medium text-slate-800">{lead.phone}</td>
                      {(leadBoard?.columns || []).map((col) => (
                        <td key={col} className="px-3 py-2 text-slate-600">{(lead.extra_data && col in lead.extra_data ? lead.extra_data[col] : col.toLowerCase() === 'name' ? lead.name : '') || '—'}</td>
                      ))}
                      {leadCamp?.campaign_type === 'ibr' && <td className="px-3 py-2">{lead.tts_status || '—'}{lead.tts_error ? ` (${lead.tts_error})` : ''}</td>}
                      <td className="px-3 py-2"><Badge variant={statusVariant(lead.lead_status || 'new')}>{prettyStatus(lead.lead_status || 'new')}</Badge></td>
                      <td className="px-3 py-2 font-mono">{lead.last_duration || '00:00'}</td>
                      <td className="px-3 py-2">{lead.last_agent || '—'}</td>
                      <td className="px-3 py-2">{lead.last_disposition || '—'}</td>
                      <td className="px-3 py-2">{lead.attempt_count || 0}</td>
                    </tr>
                    {openLead === lead.id && (
                      <tr className="bg-slate-50">
                        <td colSpan={8 + (leadBoard?.columns.length || 0)} className="px-3 py-2 text-slate-500">
                          {(lead.calls || []).length === 0 && 'No call attempts yet.'}
                          {(lead.calls || []).map((call) => (
                            <div key={call.id} className="py-1">
                              Attempt #{call.id} · {call.agent || '—'} · {call.outcome || call.disposition || 'pending'} · {call.duration} · {String(call.started_at || '').replace('T', ' ').slice(0, 16)}
                            </div>
                          ))}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {leadBoard && leadBoard.leads.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">No leads uploaded for this campaign.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </div>
  );
}
