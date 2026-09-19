import React, { useState } from 'react';
import { Card, Badge, Avatar, AgentStatusBadge, Button, StatCard, Modal } from '../ui/index';
import { agents } from '../../data/mock';

export default function LiveOps({ showToast }: { showToast: (msg: string, type?: 'success' | 'info' | 'error') => void }) {
  const [monitorAgent, setMonitorAgent] = useState<typeof agents[0] | null>(null);

  const statusCounts = {
    available: agents.filter(a => a.status === 'available').length,
    on_call: agents.filter(a => a.status === 'on_call').length,
    wrap_up: agents.filter(a => a.status === 'wrap_up').length,
    break: agents.filter(a => a.status === 'break').length,
    offline: agents.filter(a => a.status === 'offline').length,
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#F8FAFC] fade-in">
      <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">

        {/* Live header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-semibold text-green-600 uppercase tracking-widest">Live</span>
          </div>
          <p className="text-xs text-slate-400">Updates every 5 seconds</p>
        </div>

        {/* Status summary */}
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Available', count: statusCounts.available, color: 'text-green-700 bg-green-50 border-green-200' },
            { label: 'On Call', count: statusCounts.on_call, color: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
            { label: 'Wrap-up', count: statusCounts.wrap_up, color: 'text-amber-700 bg-amber-50 border-amber-200' },
            { label: 'Break', count: statusCounts.break, color: 'text-orange-700 bg-orange-50 border-orange-200' },
            { label: 'Offline', count: statusCounts.offline, color: 'text-slate-500 bg-slate-50 border-slate-200' },
          ].map(s => (
            <Card key={s.label} className={`p-4 border ${s.color} text-center`}>
              <p className="text-3xl font-bold">{s.count}</p>
              <p className="text-xs font-semibold mt-1">{s.label}</p>
            </Card>
          ))}
        </div>

        {/* Live metrics */}
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Calls in Progress" value={statusCounts.on_call} />
          <StatCard label="Queue Length" value={12} trend={-3} period="vs 10m ago" />
          <StatCard label="Avg Wait Time" value="1m 24s" trend={5.2} period="vs 10m ago" />
          <StatCard label="Calls Today" value={847} trend={12.4} period="vs yesterday" />
        </div>

        {/* Agent Grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Agent Status Grid</h3>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">Refresh</Button>
              <Button variant="outline" size="sm">Export</Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {agents.map(agent => (
              <Card key={agent.id} className={`p-4 ${agent.status === 'on_call' ? 'border-indigo-200 bg-indigo-50/30' : agent.status === 'available' ? 'border-green-200' : ''}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Avatar initials={agent.avatar} size="md" status={agent.status as 'available' | 'on_call' | 'break' | 'offline' | 'wrap_up'} />
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{agent.name}</p>
                      <p className="text-xs text-slate-400">{agent.team}</p>
                    </div>
                  </div>
                  <AgentStatusBadge status={agent.status} />
                </div>

                {agent.status === 'on_call' && (
                  <div className="bg-white rounded-lg p-2.5 mb-3 border border-indigo-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-slate-700">{agent.currentLead}</p>
                        <p className="text-xs text-slate-400">{agent.campaign}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm font-bold text-indigo-600">{agent.callDuration}</p>
                        <div className="flex gap-0.5 justify-end mt-1">
                          {[...Array(5)].map((_, i) => (
                            <span key={i} className="wave-bar h-3" style={{ animationDelay: `${i * 0.1}s` }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-900">{agent.callsToday}</p>
                    <p className="text-[10px] text-slate-400">Calls</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-900">{agent.talkTime}</p>
                    <p className="text-[10px] text-slate-400">Talk Time</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-900">{agent.conversion}</p>
                    <p className="text-[10px] text-slate-400">Conversions</p>
                  </div>
                </div>

                {/* Supervisor actions */}
                {agent.status === 'on_call' && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => { setMonitorAgent(agent); showToast(`Monitoring ${agent.name}`, 'info'); }}
                      className="flex-1 text-xs py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium transition-all"
                    >
                      👂 Monitor
                    </button>
                    <button
                      onClick={() => showToast(`Whispering to ${agent.name}`, 'info')}
                      className="flex-1 text-xs py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium transition-all"
                    >
                      💬 Whisper
                    </button>
                    <button
                      onClick={() => showToast(`Barging into ${agent.name}'s call`, 'error')}
                      className="flex-1 text-xs py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-medium transition-all"
                    >
                      🎙 Barge
                    </button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>

        {/* Call Queue */}
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Call Queues</h3>
          <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-[#E2E8F0]">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Queue</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Waiting</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Agents Available</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">In Progress</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg Wait</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {[
                  { name: 'Sales Alpha', waiting: 8, available: 2, inProgress: 2, avgWait: '1:20', priority: 'High' },
                  { name: 'Sales Beta', waiting: 4, available: 1, inProgress: 1, avgWait: '0:45', priority: 'Medium' },
                  { name: 'Inbound Support', waiting: 3, available: 0, inProgress: 3, avgWait: '3:12', priority: 'High' },
                  { name: 'Sales Gamma', waiting: 0, available: 2, inProgress: 2, avgWait: '—', priority: 'Low' },
                ].map(queue => (
                  <tr key={queue.name} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3.5 font-medium text-slate-800">{queue.name}</td>
                    <td className="px-3 py-3.5">
                      <span className={`font-mono font-bold ${queue.waiting > 5 ? 'text-red-500' : queue.waiting > 2 ? 'text-amber-500' : 'text-green-600'}`}>
                        {queue.waiting}
                      </span>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className={`font-mono font-bold ${queue.available === 0 ? 'text-red-500' : 'text-green-600'}`}>
                        {queue.available}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 font-mono text-slate-600">{queue.inProgress}</td>
                    <td className="px-3 py-3.5 font-mono text-slate-500">{queue.avgWait}</td>
                    <td className="px-3 py-3.5">
                      <Badge variant={queue.priority === 'High' ? 'danger' : queue.priority === 'Medium' ? 'warning' : 'muted'}>
                        {queue.priority}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Monitor Modal */}
      <Modal open={!!monitorAgent} onClose={() => setMonitorAgent(null)} title={`Monitoring: ${monitorAgent?.name}`} size="sm">
        {monitorAgent && (
          <div className="space-y-4">
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-center">
              <Avatar initials={monitorAgent.avatar} size="lg" />
              <p className="font-semibold text-slate-900 mt-2">{monitorAgent.currentLead}</p>
              <p className="text-xs text-slate-500">{monitorAgent.campaign}</p>
              <p className="font-mono text-2xl font-bold text-indigo-600 mt-2">{monitorAgent.callDuration}</p>
              <div className="flex justify-center gap-1 mt-2">
                {[...Array(7)].map((_, i) => (
                  <span key={i} className="wave-bar" style={{ animationDelay: `${i * 0.08}s` }} />
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="md" className="flex-1" onClick={() => { showToast(`Whispering to ${monitorAgent.name}`, 'info'); }}>💬 Whisper</Button>
              <Button variant="danger" size="md" className="flex-1" onClick={() => { showToast(`Barging into call`, 'error'); setMonitorAgent(null); }}>🎙 Barge In</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
