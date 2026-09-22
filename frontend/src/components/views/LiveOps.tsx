import React, { useEffect, useState } from 'react';
import { Card, Avatar, AgentStatusBadge, Button, StatCard, Modal } from '../ui/index';
import { api } from '../../api/client';

type LiveAgent = {
  id: number;
  name: string;
  avatar: string;
  team: string;
  mode: string;
  presence: string;
  status: string;
  campaign: string;
  phone: string;
  customer: string;
  call_state: string;
  duration: string;
  duration_seconds: number;
  calls_today: number;
};

export default function LiveOps({ showToast }: { showToast: (msg: string, type?: 'success' | 'info' | 'error') => void }) {
  const [agents, setAgents] = useState<LiveAgent[]>([]);
  const [monitorAgent, setMonitorAgent] = useState<LiveAgent | null>(null);

  const load = () => api<{ agents: LiveAgent[] }>('/api/live/agents/').then((data) => setAgents(data.agents || [])).catch(() => undefined);
  useEffect(() => {
    load();
    const tick = window.setInterval(load, 5000);
    return () => window.clearInterval(tick);
  }, []);

  const act = async (action: string, agent: LiveAgent) => {
    try {
      const res = await api<{ detail?: string }>(`/api/live/actions/`, {
        method: 'POST',
        body: JSON.stringify({ action, agent_id: agent.id }),
      });
      showToast(res.detail || `${action} logged for ${agent.name}`, 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Action failed', 'error');
    }
  };

  const statusCounts = {
    available: agents.filter((a) => a.presence === 'available' && !a.call_state).length,
    on_call: agents.filter((a) => ['initiating', 'ringing', 'connected', 'on_hold'].includes(a.call_state)).length,
    wrap_up: agents.filter((a) => a.presence === 'wrap_up').length,
    break: agents.filter((a) => a.mode === 'break').length,
    offline: agents.filter((a) => a.mode === 'offline' || a.presence === 'offline').length,
  };

  const badgeStatus = (agent: LiveAgent) => {
    if (agent.call_state === 'connected' || agent.call_state === 'on_hold') return 'on_call';
    if (agent.presence === 'wrap_up') return 'wrap_up';
    if (agent.mode === 'break') return 'break';
    if (agent.mode === 'offline' || agent.presence === 'offline') return 'offline';
    return 'available';
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#F8FAFC] fade-in">
      <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-semibold text-green-600 uppercase tracking-widest">Live</span>
          </div>
          <p className="text-xs text-slate-400">Updates every 5 seconds</p>
        </div>

        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Available', count: statusCounts.available, color: 'text-green-700 bg-green-50 border-green-200' },
            { label: 'On Call', count: statusCounts.on_call, color: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
            { label: 'Wrap-up', count: statusCounts.wrap_up, color: 'text-amber-700 bg-amber-50 border-amber-200' },
            { label: 'Break', count: statusCounts.break, color: 'text-orange-700 bg-orange-50 border-orange-200' },
            { label: 'Offline', count: statusCounts.offline, color: 'text-slate-500 bg-slate-50 border-slate-200' },
          ].map((s) => (
            <Card key={s.label} className={`p-4 border ${s.color} text-center`}>
              <p className="text-3xl font-bold">{s.count}</p>
              <p className="text-xs font-semibold mt-1">{s.label}</p>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Calls in Progress" value={statusCounts.on_call} />
          <StatCard label="Preview Auto" value={agents.filter((a) => a.mode === 'preview').length} />
          <StatCard label="Manual" value={agents.filter((a) => a.mode === 'manual').length} />
          <StatCard label="Agents" value={agents.length} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-900">Agent Status Grid</h3>
            <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {agents.map((agent) => (
              <Card key={agent.id} className={`p-4 ${agent.call_state ? 'border-indigo-200 bg-indigo-50/30' : agent.mode === 'preview' ? 'border-green-200' : ''}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <Avatar initials={agent.avatar} size="md" status={badgeStatus(agent) as 'available' | 'on_call' | 'break' | 'offline' | 'wrap_up'} />
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">{agent.name}</p>
                      <p className="text-xs text-slate-400">{agent.team || agent.mode}</p>
                    </div>
                  </div>
                  <AgentStatusBadge status={badgeStatus(agent)} />
                </div>
                <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide">{agent.mode} {agent.call_state ? `· ${agent.call_state}` : ''}</p>
                {agent.call_state && (
                  <div className="bg-white rounded-lg p-2.5 mb-3 border border-indigo-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-slate-700">{agent.customer || agent.phone}</p>
                        <p className="text-xs text-slate-400">{agent.campaign}</p>
                      </div>
                      <p className="font-mono text-sm font-bold text-indigo-600">{agent.duration}</p>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-900">{agent.calls_today}</p>
                    <p className="text-[10px] text-slate-400">Calls today</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-900">{agent.campaign || '—'}</p>
                    <p className="text-[10px] text-slate-400">Campaign</p>
                  </div>
                </div>
                {!!agent.call_state && (
                  <div className="flex gap-1.5">
                    <button onClick={() => { setMonitorAgent(agent); act('listen', agent); }} className="flex-1 text-xs py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium">Listen</button>
                    <button onClick={() => act('whisper', agent)} className="flex-1 text-xs py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium">Whisper</button>
                    <button onClick={() => act('barge', agent)} className="flex-1 text-xs py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 font-medium">Barge</button>
                  </div>
                )}
              </Card>
            ))}
            {!agents.length && <p className="text-sm text-slate-400 col-span-full">No agents in your scope yet.</p>}
          </div>
        </div>
      </div>

      <Modal open={!!monitorAgent} onClose={() => setMonitorAgent(null)} title={`Monitoring: ${monitorAgent?.name}`} size="sm">
        {monitorAgent && (
          <div className="space-y-4">
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-center">
              <Avatar initials={monitorAgent.avatar} size="lg" />
              <p className="font-semibold text-slate-900 mt-2">{monitorAgent.customer || 'Idle'}</p>
              <p className="text-xs text-slate-500">{monitorAgent.campaign}</p>
              <p className="font-mono text-2xl font-bold text-indigo-600 mt-2">{monitorAgent.duration || '—'}</p>
            </div>
            <p className="text-xs text-slate-500">Live audio join is not available on the 1:1 GSM path. The action is logged for audit.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
