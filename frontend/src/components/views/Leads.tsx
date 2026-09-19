import React, { useEffect, useState } from 'react';
import { Badge, Avatar, Button, SearchInput, ScoreRing } from '../ui/index';
import { api } from '../../api/client';
import type { Contact } from '../../api/types';

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
  const [leads, setLeads] = useState<Contact[]>([]);
  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const load = () => api<Contact[]>('/api/leads/').then(setLeads).catch((err) => showToast(err.message, 'error'));
  useEffect(() => { load(); }, []);

  const filtered = leads.filter((l) => {
    const q = search.toLowerCase();
    const extra = Object.values(l.extra_data || {}).join(' ').toLowerCase();
    const matchesSearch = l.name.toLowerCase().includes(q) || (l.company || '').toLowerCase().includes(q) || (l.phone || '').includes(q) || extra.includes(q);
    if (activeTab === 'all') return matchesSearch;
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
          <Button variant="outline" size="sm" onClick={() => showToast('Export is available when export_leads is granted', 'info')}>Export</Button>
          <Button variant="primary" size="sm" onClick={load}>Refresh</Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        {view === 'table' ? (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#F8FAFC] border-b border-[#E2E8F0] z-10">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Lead</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Score</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Stage</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Campaign</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Owner</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Last Contact</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Next Follow-up</th>
                  <th className="w-24 px-3 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-[#F1F5F9]">
                {filtered.map((lead) => {
                  const stage = leadStage(lead);
                  const owner = lead.owner_name || 'Unassigned';
                  return (
                    <tr key={lead.id} className="hover:bg-slate-50 transition-colors group">
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
                      <td className="px-3 py-3.5"><ScoreRing score={lead.lead_score} /></td>
                      <td className="px-3 py-3.5">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full border ${stageColors[stage] || 'bg-slate-50 border-slate-100'}`}>
                          {stage}
                        </span>
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
                      <td className="px-3 py-3.5">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => callLead(lead)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors" title="Call">
                            📞
                          </button>
                          <button className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 transition-colors" title="Edit">✏</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
                            <button onClick={() => callLead(lead)} className="text-green-500 hover:text-green-700 text-xs font-medium transition-colors">📞 Call</button>
                          </div>
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
    </div>
  );
}
