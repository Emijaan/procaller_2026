import React, { useEffect, useState } from 'react';
import { Badge, Avatar, Button, SearchInput, ScoreRing, Modal } from '../ui/index';
import { api, apiBlob, triggerDownload } from '../../api/client';
import { can } from '../../api/access';
import type { Contact } from '../../api/types';
import { useAuth } from '../../context/AuthContext';

interface LeadFile {
  id: number;
  file_name: string;
  campaign: number | null;
  campaign_name: string;
  created_by_name: string;
  imported_rows: number;
  dial_threads: number;
  active: boolean;
  has_file: boolean;
  lead_count: number;
  inactive_count: number;
  created_at: string;
}

const stageColors: Record<string, string> = {
  New: 'bg-slate-100 border-slate-200',
  Contacted: 'bg-blue-50 border-blue-100',
  Interested: 'bg-indigo-50 border-indigo-100',
  'Follow-up': 'bg-amber-50 border-amber-100',
  Qualified: 'bg-purple-50 border-purple-100',
  Converted: 'bg-green-50 border-green-100',
  Lost: 'bg-red-50 border-red-100',
};

const statusVariant = (s: string): 'success' | 'warning' | 'danger' | 'muted' | 'info' | 'default' | 'purple' => {
  const m: Record<string, 'success' | 'warning' | 'danger' | 'muted' | 'info' | 'default' | 'purple'> = {
    Interested: 'success', interested: 'success', Qualified: 'purple', Callback: 'info', callback: 'info',
    New: 'muted', new: 'muted', assigned: 'info', 'Not Interested': 'danger', not_interested: 'danger',
    Converted: 'success', completed: 'success',
  };
  return m[s] || 'muted';
};

const stages = ['New', 'Contacted', 'Interested', 'Follow-up', 'Qualified', 'Converted'];

function leadStage(lead: Contact): string {
  const s = (lead.lead_status || '').toLowerCase();
  const map: Record<string, string> = {
    new: 'New', assigned: 'New', calling: 'Contacted', connected: 'Contacted',
    not_connected: 'Contacted', busy: 'Contacted', no_answer: 'Contacted',
    interested: 'Interested', callback: 'Follow-up', promise_to_pay: 'Qualified',
    paid: 'Converted', completed: 'Converted', not_interested: 'Lost',
    wrong_number: 'Lost', dnc: 'Lost',
  };
  return map[s] || 'New';
}

function leadLabel(lead: Contact) {
  return (lead.lead_status || lead.status || 'new').replace(/_/g, ' ');
}

function fmtDate(value?: string | null) {
  if (!value) return '—';
  return value.replace('T', ' ').slice(0, 16);
}

export default function Leads({ showToast }: { showToast: (msg: string, type?: 'success' | 'info' | 'error') => void }) {
  const { user } = useAuth();
  const manage = can(user, 'edit_campaign');
  const [leads, setLeads] = useState<Contact[]>([]);
  const [files, setFiles] = useState<LeadFile[]>([]);
  const [fileId, setFileId] = useState<number | ''>('');
  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [reloadOpen, setReloadOpen] = useState(false);
  const [reloadCodes, setReloadCodes] = useState<{ code: string; label: string }[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [reloading, setReloading] = useState(false);

  const load = () => {
    const qs = new URLSearchParams({ limit: '2000' });
    if (fileId) qs.set('import_job', String(fileId));
    api<Contact[]>(`/api/leads/?${qs.toString()}`).then(setLeads).catch((err) => showToast(err.message, 'error'));
    if (manage) {
      api<LeadFile[]>('/api/lead-files/').then(setFiles).catch((err) => showToast(err.message, 'error'));
    }
  };
  useEffect(() => { load(); }, [fileId, manage]);

  const toggleLead = async (lead: Contact) => {
    const next = lead.status === 'Inactive' ? 'Active' : 'Inactive';
    try {
      await api(`/api/leads/${lead.id}/`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      showToast(next === 'Inactive' ? `${lead.name} will not be dialed in auto mode` : `${lead.name} is active again`, 'success');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update the lead', 'error');
    }
  };

  const toggleFile = async (file: LeadFile) => {
    const next = !file.active;
    try {
      await api(`/api/lead-files/${file.id}/`, { method: 'PATCH', body: JSON.stringify({ active: next }) });
      showToast(next ? `${file.file_name} is active again` : `${file.file_name} is off. Auto mode will skip these leads.`, 'success');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update the file', 'error');
    }
  };

  const deleteLead = async (lead: Contact) => {
    if (!window.confirm(`Delete ${lead.name || lead.phone}? This removes the lead. Call history stays.`)) return;
    try {
      await api(`/api/leads/${lead.id}/`, { method: 'DELETE' });
      showToast(`${lead.name || lead.phone} deleted`, 'success');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete the lead', 'error');
    }
  };

  const deleteFileLeads = async (file: LeadFile) => {
    if (!window.confirm(`Delete every lead from ${file.file_name}? Call history stays.`)) return;
    try {
      const result = await api<{ deleted: number; skipped: number }>(`/api/lead-files/${file.id}/`, { method: 'DELETE' });
      if (!result.deleted && !result.skipped) {
        showToast('No leads were removed', 'error');
      } else {
        showToast(`Deleted ${result.deleted} lead${result.deleted === 1 ? '' : 's'}${result.skipped ? `. ${result.skipped} still on a call` : ''}`, 'success');
      }
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete the leads', 'error');
    }
  };

  const openReload = async () => {
    setReloadOpen(true);
    setPicked([]);
    try {
      const data = await api<{ dispositions: { code: string; label: string }[] }>('/api/leads/reload/');
      setReloadCodes(data.dispositions || []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not load dispositions', 'error');
      setReloadOpen(false);
    }
  };

  const reloadLeads = async () => {
    if (picked.length === 0) {
      showToast('Select at least one disposition', 'error');
      return;
    }
    setReloading(true);
    try {
      const result = await api<{ reloaded: number; skipped: number }>('/api/leads/reload/', {
        method: 'POST',
        body: JSON.stringify({
          dispositions: picked,
          import_job: fileId || undefined,
        }),
      });
      const skipped = result.skipped ? ` ${result.skipped} left on a live call or blocked.` : '';
      showToast(`${result.reloaded} lead${result.reloaded === 1 ? '' : 's'} will be dialed again.${skipped}`, 'success');
      setReloadOpen(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not reload leads', 'error');
    } finally {
      setReloading(false);
    }
  };

  const downloadFile = async (file: LeadFile) => {
    try {
      const { blob, filename } = await apiBlob(`/api/lead-files/${file.id}/file/`);
      triggerDownload(blob, filename || file.file_name);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not download the file', 'error');
    }
  };

  const selectedFile = files.find((file) => file.id === fileId);
  const filtered = leads.filter((l) => {
    const q = search.toLowerCase();
    const extra = Object.values(l.extra_data || {}).join(' ').toLowerCase();
    const matchesSearch = l.name.toLowerCase().includes(q) || (l.company || '').toLowerCase().includes(q) || (l.phone || '').includes(q) || extra.includes(q) || (l.disposition_code || '').toLowerCase().includes(q) || (l.disposition_label || '').toLowerCase().includes(q);
    if (fileId || activeTab === 'all') return matchesSearch;
    return matchesSearch && leadStage(l).toLowerCase() === activeTab;
  });

  const callLead = (lead: Contact) => {
    sessionStorage.setItem('procaller.pendingDial', lead.phone);
    showToast(`Opening dialer for ${lead.name}...`, 'info');
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#F8FAFC] fade-in">
      <div className="bg-white border-b border-[#E2E8F0] px-6 py-3 flex items-center gap-3 shrink-0">
        <div className="w-64">
          <SearchInput placeholder="Search leads..." value={search} onChange={setSearch} />
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          <button
            onClick={() => setView('table')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${view === 'table' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-500'}`}
          >
            ☰ Table
          </button>
          <button
            onClick={() => setView('kanban')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${view === 'kanban' ? 'bg-white shadow-sm text-slate-700' : 'text-slate-500'}`}
          >
            ⊞ Kanban
          </button>
        </div>
        <select
          className="h-9 rounded-lg border border-[#E2E8F0] bg-white text-sm px-3 text-slate-600 focus:outline-none"
          value={activeTab}
          onChange={(e) => setActiveTab(e.target.value)}
        >
          <option value="all">All Stages</option>
          {stages.map((s) => <option key={s} value={s.toLowerCase()}>{s}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-2">
          {manage && (
            <Button variant="outline" size="sm" onClick={openReload}>Reload leads</Button>
          )}
          <Button variant="outline" size="sm" onClick={() => showToast('Export is available when export_leads is granted', 'info')}>Export</Button>
          <Button variant="primary" size="sm" onClick={load}>Refresh</Button>
        </div>
      </div>

      {manage && (
        <div className="bg-white border-b border-[#E2E8F0] px-6 py-3 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Uploaded files · click one to open its leads</p>
            {fileId && (
              <button type="button" onClick={() => setFileId('')} className="text-xs font-medium text-[#4F46E5]">Show all leads</button>
            )}
          </div>
          {files.length === 0 ? (
            <p className="text-xs text-slate-400">No uploaded files yet.</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {files.map((file) => (
                <div key={file.id} className={`min-w-[240px] rounded-xl border px-3 py-2 ${fileId === file.id ? 'border-[#4F46E5] bg-indigo-50/40' : 'border-[#E2E8F0] bg-[#F8FAFC]'}`}>
                  <button type="button" onClick={() => setFileId(file.id)} className="text-left w-full">
                    <p className="text-sm font-medium text-slate-800 truncate">{file.file_name || 'Upload'}</p>
                    <p className="text-[11px] text-slate-500 truncate">{file.campaign_name || 'No campaign'} · {file.lead_count} leads · {file.dial_threads} threads</p>
                  </button>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant={file.active ? 'success' : 'danger'}>{file.active ? 'Active' : 'Off'}</Badge>
                    {file.has_file && (
                      <button type="button" onClick={() => downloadFile(file)} className="text-[11px] font-medium text-[#4F46E5]">Download</button>
                    )}
                    <button type="button" onClick={() => toggleFile(file)} className="text-[11px] font-medium text-slate-600 ml-auto">
                      {file.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button type="button" onClick={() => deleteFileLeads(file)} className="text-[11px] font-medium text-red-600">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedFile && (
        <div className="bg-indigo-50 border-b border-indigo-100 px-6 py-2 text-sm text-indigo-900 shrink-0">
          <span className="font-semibold">{selectedFile.file_name}</span>
          <span className="text-indigo-700"> · {filtered.length} leads · status and disposition code</span>
        </div>
      )}

      <div className="flex-1 overflow-hidden flex flex-col">
        {view === 'table' ? (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#F8FAFC] border-b border-[#E2E8F0] z-10">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Lead</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Disposition</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Code</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Score</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Stage</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Auto</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Campaign</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Owner</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Last Contact</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Next Follow-up</th>
                  <th className="sticky right-0 bg-[#F8FAFC] min-w-[148px] px-3 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-[#F1F5F9]">
                {filtered.map((lead) => {
                  const stage = leadStage(lead);
                  const owner = lead.owner_name || 'Unassigned';
                  return (
                    <tr key={lead.id} className={`hover:bg-slate-50 transition-colors group ${lead.status === 'Inactive' ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar initials={lead.name.split(' ').map((w) => w[0]).join('')} size="sm" />
                          <div>
                            <p className="font-medium text-slate-900">{lead.name}</p>
                            <p className="text-xs text-slate-400">{lead.company || Object.values(lead.extra_data || {})[0] || '—'} · {lead.phone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3.5"><Badge variant={statusVariant(lead.lead_status || lead.status)}>{leadLabel(lead)}</Badge></td>
                      <td className="px-3 py-3.5 text-sm text-slate-700">{lead.disposition_label || 'Not Dialed'}</td>
                      <td className="px-3 py-3.5"><span className="font-mono text-xs text-slate-800">{lead.disposition_code || 'NOT_DIALED'}</span></td>
                      <td className="px-3 py-3.5"><ScoreRing score={lead.lead_score} /></td>
                      <td className="px-3 py-3.5">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full border ${stageColors[stage] || 'bg-slate-50 border-slate-100'}`}>
                          {stage}
                        </span>
                      </td>
                      <td className="px-3 py-3.5">
                        <Badge variant={lead.status === 'Inactive' ? 'danger' : 'success'}>{lead.status === 'Inactive' ? 'Off' : 'Active'}</Badge>
                      </td>
                      <td className="px-3 py-3.5 text-xs text-slate-500">{lead.campaign_name || '—'}</td>
                      <td className="px-3 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Avatar initials={owner.split(' ').map((w) => w[0]).join('')} size="sm" />
                          <span className="text-xs text-slate-600">{owner.split(' ')[0]}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3.5 text-xs text-slate-500">{fmtDate(lead.last_contact_at)}</td>
                      <td className="px-3 py-3.5 text-xs text-slate-500">{fmtDate(lead.next_callback_at)}</td>
                      <td className="sticky right-0 bg-white px-3 py-3.5 group-hover:bg-slate-50">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => callLead(lead)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors" title="Call">
                            📞
                          </button>
                          {manage && (
                            <button onClick={() => toggleLead(lead)} className="h-7 px-2 rounded-lg text-[11px] font-medium text-slate-600 hover:bg-slate-100" title={lead.status === 'Inactive' ? 'Activate' : 'Deactivate'}>
                              {lead.status === 'Inactive' ? 'On' : 'Off'}
                            </button>
                          )}
                          {manage && (
                            <button onClick={() => deleteLead(lead)} className="h-7 px-2 rounded-lg text-[11px] font-medium text-red-600 hover:bg-red-50" title="Delete lead">
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-16">No leads to show.</p>
            )}
          </div>
        ) : (
          <div className="flex-1 overflow-x-auto p-4">
            <div className="flex gap-3 h-full min-w-max">
              {stages.map((stage) => {
                const stageLeads = filtered.filter((l) => leadStage(l) === stage);
                return (
                  <div key={stage} className={`w-64 flex flex-col rounded-xl border ${stageColors[stage]} overflow-hidden`}>
                    <div className="px-3 py-2.5 flex items-center justify-between border-b border-[#E2E8F0]/60">
                      <span className="text-xs font-semibold text-slate-700">{stage}</span>
                      <span className="text-xs font-bold text-slate-500 bg-white/60 px-2 py-0.5 rounded-full">{stageLeads.length}</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2">
                      {stageLeads.map((lead) => (
                        <div key={lead.id} className="bg-white rounded-lg border border-[#E2E8F0] p-3 shadow-sm hover:shadow-md transition-all cursor-pointer">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Avatar initials={lead.name.split(' ').map((w) => w[0]).join('')} size="sm" />
                              <div>
                                <p className="text-sm font-semibold text-slate-800 leading-tight">{lead.name}</p>
                                <p className="text-xs text-slate-400">{lead.company || lead.phone}</p>
                              </div>
                            </div>
                            <ScoreRing score={lead.lead_score} />
                          </div>
                          <div className="flex items-center justify-between">
                            <Badge variant={statusVariant(lead.lead_status || lead.status)}>{leadLabel(lead)}</Badge>
                            <span className="flex items-center gap-2">
                              {manage && (
                                <button onClick={() => toggleLead(lead)} className="text-slate-500 hover:text-slate-800 text-xs font-medium">{lead.status === 'Inactive' ? 'Turn on' : 'Turn off'}</button>
                              )}
                              {manage && (
                                <button onClick={() => deleteLead(lead)} className="text-red-500 hover:text-red-700 text-xs font-medium">Delete</button>
                              )}
                              <button onClick={() => callLead(lead)} className="text-green-500 hover:text-green-700 text-xs font-medium transition-colors">📞 Call</button>
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-2">{lead.disposition_code || 'NOT_DIALED'} · {lead.disposition_label || 'Not dialed'}</p>
                          {lead.next_callback_at && (
                            <p className="text-[10px] text-slate-400 mt-2">Follow-up: {fmtDate(lead.next_callback_at)}</p>
                          )}
                        </div>
                      ))}
                      {stageLeads.length === 0 && (
                        <div className="text-center py-6 text-xs text-slate-400">No leads in {stage}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <Modal open={reloadOpen} onClose={() => setReloadOpen(false)} title="Reload leads" size="lg">
        <p className="text-sm text-slate-600 mb-3">
          {fileId
            ? 'Choose the dispositions to call again from the open file. Call history stays.'
            : 'Choose the dispositions to call again. Call history stays. Auto-dial will use these leads on the next pass.'}
        </p>
        <div className="flex items-center gap-3 mb-2">
          <button type="button" className="text-xs font-medium text-[#4F46E5]" onClick={() => setPicked(reloadCodes.map((row) => row.code))}>Select all</button>
          <button type="button" className="text-xs font-medium text-slate-500" onClick={() => setPicked([])}>Clear</button>
        </div>
        <div className="max-h-80 overflow-y-auto rounded-lg border border-[#E2E8F0] p-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {reloadCodes.map((row) => (
            <label key={row.code} className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-1 accent-[#4F46E5]"
                checked={picked.includes(row.code)}
                onChange={() => setPicked((current) => current.includes(row.code) ? current.filter((code) => code !== row.code) : [...current, row.code])}
              />
              <span>
                <span className="font-mono text-xs text-slate-800">{row.code}</span>
                <span className="block text-xs text-slate-500">{row.label}</span>
              </span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setReloadOpen(false)}>Cancel</Button>
          <Button variant="primary" loading={reloading} onClick={reloadLeads}>Reload selected</Button>
        </div>
      </Modal>
    </div>
  );
}
