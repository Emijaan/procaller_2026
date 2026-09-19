import React, { useState } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Card, StatCard, Badge, Avatar, AgentStatusBadge, ProgressBar, Button } from '../ui/index';
import { kpiData, hourlyCallData, dispositionData, agents, campaigns, followUps } from '../../data/mock';

const periods = ['Today', '7 Days', '30 Days', '90 Days'];

export default function Dashboard({ onNavigate }: { onNavigate: (v: string) => void }) {
  const [period, setPeriod] = useState('Today');

  return (
    <div className="flex-1 overflow-y-auto bg-[#F8FAFC] fade-in">
      <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Good morning, Aman 👋</h2>
            <p className="text-sm text-slate-500 mt-0.5">Here's what's happening across your organization today.</p>
          </div>
          <div className="flex items-center gap-1.5 bg-white border border-[#E2E8F0] rounded-lg p-1">
            {periods.map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${period === p ? 'bg-[#4F46E5] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Onboarding checklist */}
        <Card className="p-4 bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] border-transparent text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-sm font-semibold text-white/90">Setup Checklist</p>
                <p className="text-xs text-white/60 mt-0.5">6 of 7 steps completed</p>
              </div>
              <div className="flex items-center gap-2">
                {['Org','Team','Numbers','Contacts','Campaign','Agents','First Call'].map((step, i) => (
                  <div key={step} className="flex items-center gap-1">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${i < 6 ? 'bg-white text-[#4F46E5]' : 'bg-white/20 text-white/60'}`}>
                      {i < 6 ? '✓' : '○'}
                    </div>
                    <span className="text-[10px] text-white/60 hidden lg:block">{step}</span>
                  </div>
                ))}
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => onNavigate('dialer')}>Make First Call →</Button>
          </div>
          <ProgressBar value={6} max={7} color="bg-white" className="mt-3 bg-white/20" />
        </Card>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <StatCard label="Total Calls" value={kpiData.totalCalls.value.toLocaleString()} trend={kpiData.totalCalls.trend} period={kpiData.totalCalls.period}
            icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>} />
          <StatCard label="Connected" value={kpiData.connected.value.toLocaleString()} trend={kpiData.connected.trend} period={kpiData.connected.period}
            icon={<svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} color="text-green-500" />
          <StatCard label="Answer Rate" value={kpiData.answerRate.value} trend={kpiData.answerRate.trend} period={kpiData.answerRate.period}
            icon={<svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>} color="text-blue-500" />
          <StatCard label="Active Agents" value={kpiData.activeAgents.value} period={kpiData.activeAgents.period}
            icon={<svg className="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} color="text-purple-500" />
          <StatCard label="Conversion Rate" value={kpiData.conversionRate.value} trend={kpiData.conversionRate.trend} period={kpiData.conversionRate.period}
            icon={<svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} color="text-amber-500" />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Call Volume */}
          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Call Volume</h3>
                <p className="text-xs text-slate-400 mt-0.5">Hourly breakdown today</p>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-[#4F46E5] rounded-full inline-block" />Total</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-1 bg-[#22C55E] rounded-full inline-block" />Connected</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={hourlyCallData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="callsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="connectedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22C55E" stopOpacity={0.12} />
                    <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="hour" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#0F172A', border: 'none', borderRadius: 8, fontSize: 12, color: '#F1F5F9' }} />
                <Area type="monotone" dataKey="calls" stroke="#4F46E5" strokeWidth={2} fill="url(#callsGrad)" dot={false} />
                <Area type="monotone" dataKey="connected" stroke="#22C55E" strokeWidth={2} fill="url(#connectedGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Dispositions */}
          <Card className="p-5">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-slate-900">Dispositions</h3>
              <p className="text-xs text-slate-400 mt-0.5">Today's call outcomes</p>
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={dispositionData} cx="50%" cy="50%" innerRadius={42} outerRadius={65} dataKey="value" stroke="none">
                  {dispositionData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#0F172A', border: 'none', borderRadius: 8, fontSize: 12, color: '#F1F5F9' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2">
              {dispositionData.slice(0, 4).map(d => (
                <div key={d.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                    <span className="text-xs text-slate-500">{d.name}</span>
                  </div>
                  <span className="text-xs font-medium text-slate-700">{d.value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Live Agents + Campaigns */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Live Agent Status */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Agent Status</h3>
                <p className="text-xs text-slate-400 mt-0.5">Live — {agents.filter(a => a.status !== 'offline').length} active</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('live_ops')}>View All →</Button>
            </div>

            {/* Status summary */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { label: 'Available', count: agents.filter(a => a.status === 'available').length, color: 'text-green-600 bg-green-50' },
                { label: 'On Call', count: agents.filter(a => a.status === 'on_call').length, color: 'text-indigo-600 bg-indigo-50' },
                { label: 'Wrap-up', count: agents.filter(a => a.status === 'wrap_up').length, color: 'text-amber-600 bg-amber-50' },
                { label: 'Offline', count: agents.filter(a => a.status === 'offline').length, color: 'text-slate-400 bg-slate-50' },
              ].map(s => (
                <div key={s.label} className={`rounded-lg p-2 ${s.color} text-center`}>
                  <p className="text-lg font-bold">{s.count}</p>
                  <p className="text-[10px] font-medium">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {agents.slice(0, 4).map(agent => (
                <div key={agent.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors">
                  <Avatar initials={agent.avatar} size="sm" status={agent.status as 'available' | 'on_call' | 'break' | 'offline' | 'wrap_up'} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{agent.name}</p>
                    <p className="text-xs text-slate-400 truncate">{agent.status === 'on_call' ? agent.currentLead : agent.campaign || 'No campaign'}</p>
                  </div>
                  <div className="text-right">
                    <AgentStatusBadge status={agent.status} />
                    {agent.status === 'on_call' && agent.callDuration && (
                      <p className="text-[10px] font-mono text-slate-400 mt-0.5">{agent.callDuration}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Active Campaigns */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Active Campaigns</h3>
                <p className="text-xs text-slate-400 mt-0.5">{campaigns.filter(c => c.status === 'Running').length} running now</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('campaigns')}>View All →</Button>
            </div>
            <div className="space-y-3">
              {campaigns.filter(c => c.status === 'Running').map(camp => (
                <div key={camp.id} className="p-3 rounded-lg border border-[#E2E8F0] hover:border-[#C7D2FE] transition-all cursor-pointer">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-800">{camp.name}</span>
                    <span className="flex items-center gap-1 text-[10px] font-medium text-green-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      {camp.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500 mb-2">
                    <span>{camp.calls} calls</span>
                    <span>{camp.answerRate}% answer rate</span>
                    <span>{camp.conversions} conversions</span>
                  </div>
                  <ProgressBar value={camp.calls} max={camp.leads} />
                  <p className="text-[10px] text-slate-400 mt-1">{camp.calls} / {camp.leads} leads called</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Follow-ups + Second KPI row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Follow-ups Due Today</h3>
                <p className="text-xs text-slate-400 mt-0.5">{followUps.filter(f => f.status !== 'upcoming').length} need attention</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('followups')}>View All →</Button>
            </div>
            <div className="space-y-2">
              {followUps.filter(f => f.status !== 'upcoming').map(f => (
                <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg border border-[#E2E8F0] hover:border-[#C7D2FE] transition-all">
                  <div className={`w-1 h-12 rounded-full shrink-0 ${f.status === 'overdue' ? 'bg-red-400' : 'bg-amber-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-slate-800">{f.customer}</span>
                      {f.status === 'overdue' && <Badge variant="danger">Overdue</Badge>}
                    </div>
                    <p className="text-xs text-slate-400">{f.reason}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{f.agent} · {f.dueTime}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={f.priority === 'High' ? 'danger' : f.priority === 'Medium' ? 'warning' : 'muted'}>{f.priority}</Badge>
                    <Button variant="primary" size="sm">Call</Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Quick stats */}
          <div className="space-y-4">
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Talk Time</h3>
              <p className="text-3xl font-bold text-slate-900">42h</p>
              <p className="text-sm text-slate-400">18 min today</p>
              <div className="mt-3">
                <ProgressBar value={42} max={60} color="bg-[#4F46E5]" />
                <p className="text-xs text-slate-400 mt-1">70% of daily target</p>
              </div>
            </Card>
            <Card className="p-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Missed Calls</h3>
              <p className="text-3xl font-bold text-red-500">{kpiData.missed.value}</p>
              <p className="text-xs text-green-600 mt-1">↓ 5.1% vs yesterday</p>
              <Button variant="outline" size="sm" className="mt-3 w-full">View Missed →</Button>
            </Card>
          </div>
        </div>

      </div>
    </div>
  );
}
