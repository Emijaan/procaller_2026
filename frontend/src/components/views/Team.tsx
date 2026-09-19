import React, { useState } from 'react';
import { Avatar, Badge, Button, AgentStatusBadge, SearchInput, ProgressBar, Drawer } from '../ui/index';
import { agents } from '../../data/mock';

export default function Team({ showToast }: { showToast: (msg: string, type?: 'success' | 'info' | 'error') => void }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<typeof agents[0] | null>(null);
  const [tab, setTab] = useState('overview');

  const filtered = agents.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#F8FAFC] fade-in">
      {/* Toolbar */}
      <div className="bg-white border-b border-[#E2E8F0] px-6 py-3 flex items-center gap-3 shrink-0">
        <div className="w-64">
          <SearchInput placeholder="Search agents..." value={search} onChange={setSearch} />
        </div>
        <select className="h-9 rounded-lg border border-[#E2E8F0] bg-white text-sm px-3 text-slate-600 focus:outline-none">
          <option>All Teams</option>
          <option>Sales Alpha</option>
          <option>Sales Beta</option>
          <option>Sales Gamma</option>
        </select>
        <select className="h-9 rounded-lg border border-[#E2E8F0] bg-white text-sm px-3 text-slate-600 focus:outline-none">
          <option>All Roles</option>
          <option>Agent</option>
          <option>Senior Agent</option>
          <option>Supervisor</option>
        </select>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm">Export</Button>
          <Button variant="primary" size="sm" onClick={() => showToast('Invitation sent!', 'success')}>+ Invite Agent</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-white border-b border-[#E2E8F0] px-6 py-3 flex items-center gap-6 shrink-0">
        {[
          { label: 'Total Agents', value: agents.length },
          { label: 'Online', value: agents.filter(a => a.status !== 'offline').length, color: 'text-green-600' },
          { label: 'On Call', value: agents.filter(a => a.status === 'on_call').length, color: 'text-indigo-600' },
          { label: 'Available', value: agents.filter(a => a.status === 'available').length, color: 'text-green-600' },
          { label: 'Break', value: agents.filter(a => a.status === 'break').length, color: 'text-amber-600' },
          { label: 'Offline', value: agents.filter(a => a.status === 'offline').length, color: 'text-slate-400' },
        ].map(stat => (
          <div key={stat.label}>
            <span className={`text-lg font-bold ${stat.color || 'text-slate-900'}`}>{stat.value}</span>
            <span className="text-xs text-slate-400 ml-1.5">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#F8FAFC] border-b border-[#E2E8F0] z-10">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Agent</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Team</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Calls Today</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Talk Time</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Conversions</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Goal</th>
              <th className="w-20 px-3 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-[#F1F5F9]">
            {filtered.map(agent => (
              <tr key={agent.id} className="hover:bg-slate-50 transition-colors group cursor-pointer" onClick={() => setSelected(agent)}>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar initials={agent.avatar} size="md" status={agent.status as 'available' | 'on_call' | 'break' | 'offline' | 'wrap_up'} />
                    <div>
                      <p className="font-medium text-slate-900">{agent.name}</p>
                      <p className="text-xs text-slate-400">EMP-{agent.id.toUpperCase()}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  <Badge variant="default">{agent.role}</Badge>
                </td>
                <td className="px-3 py-3.5 text-slate-600 text-sm">{agent.team}</td>
                <td className="px-3 py-3.5"><AgentStatusBadge status={agent.status} /></td>
                <td className="px-3 py-3.5 font-mono text-slate-700">{agent.callsToday}</td>
                <td className="px-3 py-3.5 text-slate-600">{agent.talkTime}</td>
                <td className="px-3 py-3.5">
                  <span className="font-semibold text-indigo-600">{agent.conversion}</span>
                </td>
                <td className="px-3 py-3.5 w-32">
                  <div className="flex items-center gap-2">
                    <ProgressBar value={agent.conversion} max={15} color="bg-[#4F46E5]" className="flex-1" />
                    <span className="text-xs text-slate-400 shrink-0">{agent.conversion}/15</span>
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={e => { e.stopPropagation(); showToast(`Monitoring ${agent.name}`, 'info'); }} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 transition-colors text-xs" title="Monitor">👂</button>
                    <button onClick={e => { e.stopPropagation(); setSelected(agent); }} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 transition-colors text-xs" title="View">👁</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Agent Profile Drawer */}
      <Drawer open={!!selected} onClose={() => setSelected(null)} title="Agent Profile">
        {selected && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Avatar initials={selected.avatar} size="lg" status={selected.status as 'available' | 'on_call' | 'break' | 'offline' | 'wrap_up'} />
              <div>
                <h2 className="text-lg font-bold text-slate-900">{selected.name}</h2>
                <p className="text-sm text-slate-500">{selected.role} · {selected.team}</p>
                <AgentStatusBadge status={selected.status} />
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-[#E2E8F0]">
              {['overview', 'calls', 'performance'].map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-all ${tab === t ? 'border-[#4F46E5] text-[#4F46E5]' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab === 'overview' && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Calls Today', value: selected.callsToday },
                    { label: 'Talk Time', value: selected.talkTime },
                    { label: 'Conversions', value: selected.conversion },
                    { label: 'Conversion Rate', value: `${Math.round((selected.conversion / Math.max(selected.callsToday, 1)) * 100)}%` },
                  ].map(m => (
                    <div key={m.label} className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs text-slate-400 mb-0.5">{m.label}</p>
                      <p className="text-xl font-bold text-slate-900">{m.value}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-2">Daily Goal Progress</p>
                  <ProgressBar value={selected.conversion} max={15} color="bg-[#4F46E5]" />
                  <p className="text-xs text-slate-400 mt-1">{selected.conversion} of 15 conversions</p>
                </div>
              </div>
            )}

            {tab === 'calls' && (
              <div className="space-y-2">
                {[1,2,3,4,5].map(i => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-[#E2E8F0]">
                    <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-sm">📞</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800">Customer {i}</p>
                      <p className="text-xs text-slate-400">Connected · 0{i}:{i * 7}:00</p>
                    </div>
                    <Badge variant={i % 2 === 0 ? 'success' : 'info'}>{i % 2 === 0 ? 'Interested' : 'Callback'}</Badge>
                  </div>
                ))}
              </div>
            )}

            {tab === 'performance' && (
              <div className="space-y-3">
                {[
                  { label: 'Answer Rate', value: 68, target: 70 },
                  { label: 'Avg Duration', value: 72, target: 80 },
                  { label: 'Script Adherence', value: 85, target: 90 },
                  { label: 'Follow-up Completion', value: 91, target: 85 },
                ].map(m => (
                  <div key={m.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-slate-600">{m.label}</span>
                      <span className={`text-sm font-bold ${m.value >= m.target ? 'text-green-600' : 'text-amber-600'}`}>{m.value}%</span>
                    </div>
                    <ProgressBar value={m.value} max={100} color={m.value >= m.target ? 'bg-green-500' : 'bg-amber-400'} />
                    <p className="text-[10px] text-slate-400 mt-0.5">Target: {m.target}%</p>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="md" className="flex-1">Message</Button>
              <Button variant="primary" size="md" className="flex-1" onClick={() => showToast(`Monitoring ${selected.name}`, 'info')}>👂 Monitor</Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
