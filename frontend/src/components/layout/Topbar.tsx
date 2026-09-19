import React, { useState, useEffect } from 'react';
import { Button } from '../ui/index';

interface TopbarProps {
  view: string;
  onSearch: () => void;
  isDark: boolean;
  onToggleDark: () => void;
}

const viewTitles: Record<string, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Organization overview' },
  live_ops: { title: 'Live Operations', subtitle: 'Real-time agent monitoring' },
  dialer: { title: 'Dialer', subtitle: 'Outbound calling workspace' },
  contacts: { title: 'Contacts', subtitle: 'Contact management' },
  leads: { title: 'Leads', subtitle: 'Lead pipeline' },
  campaigns: { title: 'Campaigns', subtitle: 'Campaign management' },
  call_queue: { title: 'Call Queue', subtitle: 'Inbound queue management' },
  call_history: { title: 'Calls', subtitle: 'Call history and records' },
  recordings: { title: 'Recordings', subtitle: 'Call recordings and AI insights' },
  followups: { title: 'Follow-ups', subtitle: 'Scheduled follow-ups' },
  analytics: { title: 'Analytics', subtitle: 'Performance analytics' },
  team: { title: 'Team', subtitle: 'Agent management' },
  reports: { title: 'Reports', subtitle: 'Custom reports' },
  phone_numbers: { title: 'Phone Numbers', subtitle: 'Number management' },
  ivr: { title: 'IVR & Call Flows', subtitle: 'Configure routing' },
  integrations: { title: 'Integrations', subtitle: 'Connected services' },
  billing: { title: 'Billing', subtitle: 'Plan and usage' },
  security: { title: 'Security', subtitle: 'Security settings' },
  audit_logs: { title: 'Audit Logs', subtitle: 'Activity and access logs' },
  settings: { title: 'Settings', subtitle: 'Organization settings' },
};

export default function Topbar({ view, onSearch, isDark, onToggleDark }: TopbarProps) {
  const meta = viewTitles[view] || { title: view, subtitle: '' };
  const [time, setTime] = useState(new Date());
  const [notifs, setNotifs] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const timeStr = time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <header className="h-14 border-b border-[#E2E8F0] bg-white flex items-center px-6 gap-4 shrink-0">
      {/* Page identity */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold text-slate-900 leading-none">{meta.title}</h1>
          {view === 'live_ops' && (
            <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              LIVE
            </span>
          )}
        </div>
      </div>

      {/* Search trigger */}
      <button
        onClick={onSearch}
        className="flex items-center gap-2 h-8 px-3 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] text-slate-400 text-sm hover:border-[#4F46E5]/30 hover:bg-white transition-all group"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className="text-xs">Search...</span>
        <kbd className="ml-2 text-[10px] font-mono bg-white border border-[#E2E8F0] px-1.5 py-0.5 rounded text-slate-300 group-hover:text-slate-400">⌘K</kbd>
      </button>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400 font-mono">{timeStr}</span>

        {/* Dark mode */}
        <button
          onClick={onToggleDark}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
          title="Toggle dark mode"
        >
          {isDark ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
        </button>

        {/* Notifications */}
        <button
          onClick={() => setNotifs(!notifs)}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all relative"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span className="absolute top-1 right-1 w-2 h-2 bg-[#4F46E5] rounded-full border border-white" />
        </button>

        {/* Status indicator */}
        <div className="flex items-center gap-2 pl-2 border-l border-[#E2E8F0]">
          <span className="w-2 h-2 rounded-full bg-green-400" />
          <span className="text-xs text-slate-400">All systems operational</span>
        </div>
      </div>

      {/* Notification dropdown */}
      {notifs && (
        <div className="absolute top-14 right-6 w-80 bg-white border border-[#E2E8F0] rounded-xl shadow-xl z-50 fade-in overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#E2E8F0]">
            <span className="text-sm font-semibold text-slate-900">Notifications</span>
            <button className="text-xs text-[#4F46E5] font-medium hover:underline">Mark all read</button>
          </div>
          {[
            { icon: '📋', text: 'Follow-up overdue: Meena Iyer', time: '5m ago', unread: true },
            { icon: '📞', text: 'Missed call from +91 98765 43210', time: '12m ago', unread: true },
            { icon: '🎯', text: 'Campaign "Hyderabad SaaS" reached 80% completion', time: '1h ago', unread: true },
            { icon: '👤', text: 'Priya Singh is now offline', time: '2h ago', unread: false },
          ].map((n, i) => (
            <div key={i} className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors ${n.unread ? 'bg-[#F8FAFF]' : ''}`}>
              <span className="text-base shrink-0 mt-0.5">{n.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700 leading-snug">{n.text}</p>
                <p className="text-xs text-slate-400 mt-0.5">{n.time}</p>
              </div>
              {n.unread && <span className="w-2 h-2 rounded-full bg-[#4F46E5] shrink-0 mt-2" />}
            </div>
          ))}
          <div className="px-4 py-3 border-t border-[#E2E8F0] text-center">
            <button className="text-xs text-[#4F46E5] font-medium hover:underline">View all notifications</button>
          </div>
        </div>
      )}
    </header>
  );
}
