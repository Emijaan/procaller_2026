import React, { useState } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, FunnelChart, Funnel, LabelList, PieChart, Pie, Cell } from 'recharts';
import { Card, StatCard, Badge, Avatar, Button } from '../ui/index';
import { hourlyCallData, dispositionData, agents } from '../../data/mock';

const weeklyData = [
  { day: 'Mon', calls: 312, connected: 198, conversions: 24 },
  { day: 'Tue', calls: 278, connected: 174, conversions: 18 },
  { day: 'Wed', calls: 356, connected: 229, conversions: 31 },
  { day: 'Thu', calls: 291, connected: 185, conversions: 22 },
  { day: 'Fri', calls: 347, connected: 218, conversions: 28 },
  { day: 'Sat', calls: 89, connected: 54, conversions: 7 },
  { day: 'Sun', calls: 42, connected: 24, conversions: 3 },
];

const funnelData = [
  { name: 'Leads', value: 1230, fill: '#4F46E5' },
  { name: 'Contacted', value: 847, fill: '#7C3AED' },
  { name: 'Connected', value: 534, fill: '#2563EB' },
  { name: 'Interested', value: 187, fill: '#0891B2' },
  { name: 'Qualified', value: 94, fill: '#059669' },
  { name: 'Converted', value: 49, fill: '#16A34A' },
];

export default function Analytics() {
  const [period, setPeriod] = useState('7d');

  return (
    <div className="flex-1 overflow-y-auto bg-[#F8FAFC] fade-in">
      <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">

        {/* Period selector */}
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Performance Overview</h2>
          <div className="flex items-center gap-1 bg-white border border-[#E2E8F0] rounded-lg p-1">
            {[['1d','Today'],['7d','7 Days'],['30d','30 Days'],['90d','90 Days']].map(([id, label]) => (
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

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Calls" value="2,115" trend={8.4} period="vs last period" />
          <StatCard label="Answer Rate" value="63.1%" trend={2.1} period="vs last period" />
          <StatCard label="Avg Duration" value="4m 22s" trend={-0.8} period="vs last period" />
          <StatCard label="Conversions" value="133" trend={15.2} period="vs last period" />
        </div>

        {/* Main charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Weekly Volume */}
          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Weekly Call Volume</h3>
                <p className="text-xs text-slate-400 mt-0.5">Calls, connections, and conversions</p>
              </div>
              <div className="flex gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-[#4F46E5] rounded-full inline-block" />Total</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-[#22C55E] rounded-full inline-block" />Connected</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-[#F59E0B] rounded-full inline-block" />Conversions</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weeklyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#0F172A', border: 'none', borderRadius: 8, fontSize: 12, color: '#F1F5F9' }} />
                <Bar dataKey="calls" fill="#EEF2FF" radius={[4, 4, 0, 0]} />
                <Bar dataKey="connected" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                <Bar dataKey="conversions" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Disposition Pie */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Call Outcomes</h3>
            <p className="text-xs text-slate-400 mb-4">Disposition breakdown</p>
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={dispositionData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" stroke="none">
                  {dispositionData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#0F172A', border: 'none', borderRadius: 8, fontSize: 12, color: '#F1F5F9' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5">
              {dispositionData.map(d => (
                <div key={d.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="text-xs text-slate-500">{d.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-700">{d.value}</span>
                    <span className="text-xs text-slate-400">{Math.round(d.value / 634 * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Conversion Funnel + Agent Leaderboard */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Funnel */}
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Conversion Funnel</h3>
            <p className="text-xs text-slate-400 mb-4">End-to-end pipeline</p>
            <div className="space-y-2">
              {funnelData.map((stage, i) => {
                const pct = Math.round((stage.value / funnelData[0].value) * 100);
                const prevPct = i > 0 ? Math.round((stage.value / funnelData[i-1].value) * 100) : 100;
                return (
                  <div key={stage.name}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-slate-700">{stage.name}</span>
                      <div className="flex items-center gap-3">
                        {i > 0 && <span className="text-xs text-slate-400">{prevPct}% from prev</span>}
                        <span className="text-sm font-bold text-slate-900">{stage.value.toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="h-7 bg-slate-50 rounded-lg overflow-hidden relative">
                      <div
                        className="h-full rounded-lg transition-all duration-700 flex items-center justify-end pr-3"
                        style={{ width: `${pct}%`, background: stage.fill }}
                      >
                        <span className="text-[11px] font-bold text-white">{pct}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Agent Leaderboard */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Agent Leaderboard</h3>
                <p className="text-xs text-slate-400 mt-0.5">By conversions today</p>
              </div>
              <Button variant="ghost" size="sm">View All →</Button>
            </div>
            <div className="space-y-3">
              {[...agents].sort((a, b) => b.conversion - a.conversion).map((agent, i) => (
                <div key={agent.id} className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? 'bg-amber-100 text-amber-600' : i === 1 ? 'bg-slate-100 text-slate-500' : i === 2 ? 'bg-orange-50 text-orange-500' : 'text-slate-300'}`}>
                    {i < 3 ? ['🥇','🥈','🥉'][i] : i + 1}
                  </div>
                  <Avatar initials={agent.avatar} size="sm" status={agent.status as 'available' | 'on_call' | 'break' | 'offline' | 'wrap_up'} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{agent.name}</p>
                    <p className="text-xs text-slate-400">{agent.callsToday} calls · {agent.talkTime}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-slate-900">{agent.conversion}</p>
                    <p className="text-[10px] text-slate-400">conversions</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Hourly trend */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Intraday Pattern</h3>
              <p className="text-xs text-slate-400 mt-0.5">Hourly call volume and connect rate</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={hourlyCallData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#0F172A', border: 'none', borderRadius: 8, fontSize: 12, color: '#F1F5F9' }} />
              <Area type="monotone" dataKey="calls" stroke="#4F46E5" strokeWidth={2} fill="url(#areaGrad)" dot={false} />
              <Area type="monotone" dataKey="connected" stroke="#22C55E" strokeWidth={2} fill="none" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

      </div>
    </div>
  );
}
