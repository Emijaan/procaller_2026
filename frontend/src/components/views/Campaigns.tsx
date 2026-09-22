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
  const [draft, setDraft] = useState({ name: '', description: '', dial_method: 'preview', code: '', wrap_up_seconds: '30', dial_ratio: '1' });
  const [createdId, setCreatedId] = useState<number | null>(null);
  const [assigned, setAssigned] = useState<number[]>([]);
  const [preview, setPreview] = useState<Preview>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState('');
  const [tab, setTab] = useState('all');
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
    setDraft({ name: '', description: '', dial_method: 'preview', code: '', wrap_up_seconds: '30', dial_ratio: '1' });
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

  const confirmExcel = async () => {
    if (!pendingFile || !preview) return;
    const id = await ensureCampaign();
    const token = localStorage.getItem('procaller.access') || '';
    const body = new FormData();
    body.append('file', pendingFile);
    body.append('job_id', String(preview.job_id));
    const result = await fetch(`/api/campaigns/${id}/import/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json()).detail || 'Import failed');
      return r.json();
    });
    setImportResult(`Imported ${result.imported} · Invalid ${result.invalid} · Total ${result.total_leads}`);
    showToast(`Imported ${result.imported} leads`, 'success');
    load();
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
    if (tab === 'all') return true;
    if (tab === 'active') return c.status === 'active' || c.status === 'running';
    return c.status === tab;
  });

  return (
    <div className="flex-1 overflow-y-auto bg-[#F8FAFC] fade-in">
      <div className="max-w-[1200px] mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {[
              { label: 'All', id: 'all', count: campaigns.length },
              { label: 'Running', id: 'running', count: campaigns.filter((c) => c.status === 'running' || c.status === 'active').length },
              { label: 'Paused', id: 'paused', count: campaigns.filter((c) => c.status === 'paused').length },
              { label: 'Draft', id: 'draft', count: campaigns.filter((c) => c.status === 'draft').length },
            ].map((item) => (
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
                  <p className="text-xs text-slate-400 mt-0.5">{camp.dial_method} · wrap {camp.wrap_up_seconds ?? 30}s · ratio {camp.dial_ratio ?? 1} · {camp.lead_count || 0} leads</p>
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
              <p className="text-[10px] text-slate-400 mt-2">
                Hold audio: {camp.has_hold_audio ? (camp.hold_audio_name || 'Uploaded MP3') : 'Default tone · MP3 up to 5MB'}
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
                <p className="text-xs text-slate-400 mt-1">Mobile column is mandatory. Other columns are stored dynamically.</p>
                {importResult && <p className="text-xs text-green-600 mt-2">{importResult}</p>}
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => {
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
                  <Button variant="primary" size="sm" onClick={() => confirmExcel().catch((err) => showToast(err.message, 'error'))}>Confirm import</Button>
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
                  { id: 'preview', label: 'Preview Auto', desc: 'System reserves the next lead and dials automatically' },
                  { id: 'manual', label: 'Manual', desc: 'Agent manually initiates each call' },
                  { id: 'progressive', label: 'Progressive', desc: 'Coming later — not enabled yet' },
                  { id: 'power', label: 'Power', desc: 'Coming later — not enabled yet' },
                ].map((mode) => (
                  <label key={mode.id} className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors ${draft.dial_method === mode.id ? 'border-[#4F46E5] bg-[#EEF2FF]' : 'border-[#E2E8F0] hover:border-[#4F46E5]/40'} ${mode.id === 'progressive' || mode.id === 'power' ? 'opacity-60' : ''}`}>
                    <input
                      type="radio"
                      name="mode"
                      value={mode.id}
                      disabled={mode.id === 'progressive' || mode.id === 'power'}
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
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Dial ratio (1–32)</label>
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
                    await api(`/api/campaigns/${id}/`, { method: 'PATCH', body: JSON.stringify({ status: 'active', dial_method: draft.dial_method, assigned_users: assigned, wrap_up_seconds: Number(draft.wrap_up_seconds) || 30, dial_ratio: Math.min(32, Math.max(1, Number(draft.dial_ratio) || 1)), code: draft.code }) });
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
    </div>
  );
}
