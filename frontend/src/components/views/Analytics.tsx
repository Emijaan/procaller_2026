import React, { useEffect, useState } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Card, StatCard, Avatar } from '../ui/index';
import { api } from '../../api/client';

type SeriesPoint = { label: string; calls: number; connected: number };
type Outcome = { name: string; value: number };
type FunnelStage = { name: string; value: number };
type AgentRow = { id: number; name: string; initials: string; calls: number; connected: number; talk_seconds: number };
type HourPoint = { hour: string; calls: number; connected: number };
type AnalyticsPayload = {
  totals: {
    calls: number;
    calls_trend: number | null;
    answer_rate: number;
    answer_rate_trend: number | null;
    avg_duration_seconds: number;
    avg_duration_trend: number | null;
    connected: number;
    connected_trend: number | null;
  };
  series: SeriesPoint[];
  hourly: HourPoint[];
  outcomes: Outcome[];
  funnel: FunnelStage[];
  agents: AgentRow[];
};

const COLORS = ['#4F46E5', '#22C55E', '#F59E0B', '#EF4444', '#0891B2', '#7C3AED', '#64748B', '#F97316'];
const FUNNEL_COLORS = ['#4F46E5', '#7C3AED', '#059669'];

const emptyPayload: AnalyticsPayload = {
  totals: {
    calls: 0,
    calls_trend: null,
    answer_rate: 0,
    answer_rate_trend: null,
    avg_duration_seconds: 0,
    avg_duration_trend: null,
    connected: 0,
    connected_trend: null,
  },
  series: [],
  hourly: [],
  outcomes: [],
  funnel: [],
  agents: [],
};

function formatTalk(seconds: number) {
  const total = Math.max(0, Math.round(seconds || 0));
  const minutes = Math.floor(total / 60);
  const remain = total % 60;
  if (minutes) return `${minutes}m ${remain}s`;
  return `${remain}s`;
}

export default function Analytics() {
  const [period, setPeriod] = useState('7d');
  const [data, setData] = useState<AnalyticsPayload>(emptyPayload);

  useEffect(() => {
    api<AnalyticsPayload>(`/api/analytics/?period=${period}`)
      .then(setData)
      .catch(() => setData(emptyPayload));
  }, [period]);

  const totals = data.totals;
  const outcomeTotal = data.outcomes.reduce((sum, row) => sum + row.value, 0);
  const funnelBase = data.funnel[0]?.value || 0;

  return (
    <div className="flex-1 overflow-y-auto bg-[#F8FAFC] fade-in">
      <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Performance Overview</h2>
          <div className="flex items-center gap-1 bg-white border border-[#E2E8F0] rounded-lg p-1">
            {[['1d', 'Today'], ['7d', '7 Days'], ['30d', '30 Days'], ['90d', '90 Days']].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setPeriod(id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${period === id ? 'bg-[#4F46E5] text-white' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Calls" value={totals.calls.toLocaleString()} trend={totals.calls_trend ?? undefined} period="vs previous period" />
          <StatCard label="Answer Rate" value={`${totals.answer_rate}%`} trend={totals.answer_rate_trend ?? undefined} period="vs previous period" />
          <StatCard label="Avg Talk" value={formatTalk(totals.avg_duration_seconds)} trend={totals.avg_duration_trend ?? undefined} period="vs previous period" />
          <StatCard label="Connected" value={totals.connected.toLocaleString()} trend={totals.connected_trend ?? undefined} period="vs previous period" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Call Volume</h3>
                <p className="text-xs text-slate-400 mt-0.5">Calls placed by you and your team</p>
              </div>
              <div className="flex gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-[#C7D2FE] rounded-full inline-block" />Total</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-[#4F46E5] rounded-full inline-block" />Connected</span>
              </div>
            </div>
            {data.series.some((row) => row.calls > 0) ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.series} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} interval={period === '90d' ? 6 : period === '30d' ? 2 : 0} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#0F172A', border: 'none', borderRadius: 8, fontSize: 12, color: '#F1F5F9' }} />
                  <Bar dataKey="calls" fill="#EEF2FF" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="connected" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="h-[220px] flex items-center justify-center text-sm text-slate-400">No calls in this period.</p>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Call Outcomes</h3>
            <p className="text-xs text-slate-400 mb-4">Disposition codes from your calls</p>
            {data.outcomes.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={data.outcomes} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" stroke="none">
                      {data.outcomes.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#0F172A', border: 'none', borderRadius: 8, fontSize: 12, color: '#F1F5F9' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5">
                  {data.outcomes.map((row, index) => (
                    <div key={row.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[index % COLORS.length] }} />
                        <span className="text-xs text-slate-500">{row.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-700">{row.value}</span>
                        <span className="text-xs text-slate-400">{outcomeTotal ? Math.round(row.value / outcomeTotal * 100) : 0}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="h-[220px] flex items-center justify-center text-sm text-slate-400">No outcomes in this period.</p>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Lead Pipeline</h3>
            <p className="text-xs text-slate-400 mb-4">Leads you can see, and how many were dialed or connected in this period</p>
            <div className="space-y-2">
              {data.funnel.map((stage, index) => {
                const pct = funnelBase ? Math.round((stage.value / funnelBase) * 100) : 0;
                const previous = index > 0 ? data.funnel[index - 1].value : stage.value;
                const fromPrevious = previous ? Math.round((stage.value / previous) * 100) : 0;
                return (
                  <div key={stage.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-700">{stage.name}</span>
                      <div className="flex items-center gap-3">
                        {index > 0 && <span className="text-xs text-slate-400">{fromPrevious}% from prev</span>}
                        <span className="text-sm font-bold text-slate-900">{stage.value.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="h-7 bg-slate-50 rounded-lg overflow-hidden relative">
                      <div
                        className="h-full rounded-lg flex items-center justify-end pr-3"
                        style={{ width: `${Math.max(pct, stage.value ? 8 : 0)}%`, background: FUNNEL_COLORS[index % FUNNEL_COLORS.length] }}
                      >
                        {stage.value > 0 && <span className="text-[11px] font-bold text-white">{pct}%</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Team</h3>
              <p className="text-xs text-slate-400 mt-0.5">People on your line who placed calls in this period</p>
            </div>
            {data.agents.length > 0 ? (
              <div className="space-y-3">
                {data.agents.map((agent, index) => (
                  <div key={agent.id} className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${index === 0 ? 'bg-amber-100 text-amber-600' : 'text-slate-400'}`}>
                      {index + 1}
                    </div>
                    <Avatar initials={agent.initials || 'PC'} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{agent.name}</p>
                      <p className="text-xs text-slate-400">{agent.calls} calls · {formatTalk(agent.talk_seconds)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-slate-900">{agent.connected}</p>
                      <p className="text-[10px] text-slate-400">connected</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-slate-400">No calls from your team in this period.</p>
            )}
          </Card>
        </div>

        <Card className="p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Time of Day</h3>
            <p className="text-xs text-slate-400 mt-0.5">When your calls were placed</p>
          </div>
          {data.hourly.some((row) => row.calls > 0) ? (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={data.hourly} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} interval={2} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#0F172A', border: 'none', borderRadius: 8, fontSize: 12, color: '#F1F5F9' }} />
                <Area type="monotone" dataKey="calls" stroke="#4F46E5" strokeWidth={2} fill="url(#areaGrad)" dot={false} />
                <Area type="monotone" dataKey="connected" stroke="#22C55E" strokeWidth={2} fill="none" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="h-[160px] flex items-center justify-center text-sm text-slate-400">No calls in this period.</p>
          )}
        </Card>

      </div>
    </div>
  );
}
