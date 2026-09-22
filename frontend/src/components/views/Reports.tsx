import React, { useEffect, useState } from 'react';
import { Card, Button } from '../ui/index';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

type AgentRow = {
  user_id: number;
  agent: string;
  mode: string;
  online: number;
  manual: number;
  preview: number;
  break: number;
  total_calls: number;
  answered: number;
  unanswered: number;
  busy: number;
  no_answer: number;
  failed: number;
  talk_seconds: number;
  hold_seconds: number;
};

function hms(v = 0) {
  const s = Math.max(0, Number(v) || 0);
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export default function Reports() {
  const { user } = useAuth();
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [totals, setTotals] = useState({ calls: 0, answered: 0, unanswered: 0, talk_seconds: 0, hold_seconds: 0 });

  const qs = `from=${from}&to=${to}`;
  const load = () => {
    api<{ agents: AgentRow[]; totals: typeof totals }>(`/api/reports/daily/?${qs}`).then((data) => {
      setAgents(data.agents || []);
      setTotals(data.totals || totals);
    }).catch(() => undefined);
    api<{ campaigns: any[] }>(`/api/reports/campaigns/?${qs}`).then((data) => setCampaigns(data.campaigns || [])).catch(() => undefined);
  };
  useEffect(() => { load(); }, [from, to]);

  const download = (kind: string, format: string) => {
    const token = localStorage.getItem('procaller.access') || '';
    fetch(`/api/reports/export/?kind=${kind}&file=${format}&${qs}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) throw new Error('Export failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${kind}-report.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => undefined);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#F8FAFC] fade-in">
      <div className="max-w-[1200px] mx-auto px-6 py-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-lg border border-[#E2E8F0] px-3 text-sm" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-[#E2E8F0] px-3 text-sm" />
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => download('daily', 'csv')}>Agent CSV</Button>
            <Button variant="secondary" size="sm" onClick={() => download('daily', 'xlsx')}>Agent Excel</Button>
            <Button variant="outline" size="sm" onClick={() => download('campaign', 'xlsx')}>Campaign Excel</Button>
          </div>
        </div>
        <p className="text-xs text-slate-400">{user?.display_name} · scoped to your permission. Agents only see their own rows.</p>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="p-4"><p className="text-2xl font-bold">{totals.calls}</p><p className="text-xs text-slate-500">Calls</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold">{totals.answered}</p><p className="text-xs text-slate-500">Answered</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold">{totals.unanswered}</p><p className="text-xs text-slate-500">Unanswered</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold">{hms(totals.talk_seconds)}</p><p className="text-xs text-slate-500">Talk</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold">{hms(totals.hold_seconds)}</p><p className="text-xs text-slate-500">Hold</p></Card>
        </div>

        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left px-3 py-2">Agent</th>
                <th className="text-left px-3 py-2">Mode</th>
                <th className="text-left px-3 py-2">Online</th>
                <th className="text-left px-3 py-2">Preview</th>
                <th className="text-left px-3 py-2">Break</th>
                <th className="text-left px-3 py-2">Calls</th>
                <th className="text-left px-3 py-2">Answered</th>
                <th className="text-left px-3 py-2">Talk</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((row) => (
                <tr key={row.user_id} className="border-t border-[#E2E8F0]">
                  <td className="px-3 py-2 font-medium">{row.agent}</td>
                  <td className="px-3 py-2 capitalize">{row.mode}</td>
                  <td className="px-3 py-2 font-mono text-xs">{hms(row.online)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{hms(row.preview)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{hms(row.break)}</td>
                  <td className="px-3 py-2">{row.total_calls}</td>
                  <td className="px-3 py-2">{row.answered}</td>
                  <td className="px-3 py-2 font-mono text-xs">{hms(row.talk_seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left px-3 py-2">Campaign</th>
                <th className="text-left px-3 py-2">Leads</th>
                <th className="text-left px-3 py-2">Pending</th>
                <th className="text-left px-3 py-2">Answered</th>
                <th className="text-left px-3 py-2">No answer</th>
                <th className="text-left px-3 py-2">Busy</th>
                <th className="text-left px-3 py-2">Connected %</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((row) => (
                <tr key={row.id} className="border-t border-[#E2E8F0]">
                  <td className="px-3 py-2 font-medium">{row.name} {row.code ? `· ${row.code}` : ''}</td>
                  <td className="px-3 py-2">{row.total_leads}</td>
                  <td className="px-3 py-2">{row.pending}</td>
                  <td className="px-3 py-2">{row.answered}</td>
                  <td className="px-3 py-2">{row.no_answer}</td>
                  <td className="px-3 py-2">{row.busy}</td>
                  <td className="px-3 py-2">{row.connected_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
