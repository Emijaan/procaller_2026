import React from 'react';
import type { User } from '../../api/types';
import { can, roleLabel } from '../../api/access';
import { useAuth } from '../../context/AuthContext';

type NavView = string;

interface NavItem {
  id: NavView;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  section?: string;
}

const Icon = ({ path, ...p }: { path: string; [k: string]: unknown }) => (
  <svg className="w-[18px] h-[18px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} {...p as object}>
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <Icon path="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /> },
  { id: 'live_ops', label: 'Live Operations', icon: <Icon path="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z" /> },
  { id: 'dialer', label: 'Dialer', icon: <Icon path="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /> },
  { id: 'contacts', label: 'Contacts', icon: <Icon path="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /> },
  { id: 'leads', label: 'Leads', icon: <Icon path="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> },
  { id: 'campaigns', label: 'Campaigns', icon: <Icon path="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /> },
  { id: 'call_queue', label: 'Call Queue', icon: <Icon path="M4 6h16M4 10h16M4 14h16M4 18h16" />, badge: 12 },
  { id: 'call_history', label: 'Calls', icon: <Icon path="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /> },
  { id: 'recordings', label: 'Recordings', icon: <Icon path="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /> },
  { id: 'followups', label: 'Follow-ups', icon: <Icon path="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />, badge: 3 },
  { id: 'analytics', label: 'Analytics', icon: <Icon path="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /> },
  { id: 'team', label: 'Team', icon: <Icon path="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /> },
  { id: 'reports', label: 'Reports', icon: <Icon path="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /> },
];

const adminItems: NavItem[] = [
  { id: 'phone_numbers', label: 'Phone Numbers', icon: <Icon path="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /> },
  { id: 'ivr', label: 'IVR / Call Flows', icon: <Icon path="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /> },
  { id: 'integrations', label: 'Integrations', icon: <Icon path="M13 10V3L4 14h7v7l9-11h-7z" /> },
  { id: 'billing', label: 'Billing', icon: <Icon path="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /> },
  { id: 'security', label: 'Security', icon: <Icon path="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /> },
  { id: 'audit_logs', label: 'Audit Logs', icon: <Icon path="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /> },
  { id: 'settings', label: 'Settings', icon: <Icon path="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" /> },
];

interface SidebarProps { active: string; onNavigate: (view: string) => void; collapsed: boolean; onToggle: () => void; user?: User; }

export default function Sidebar({ active, onNavigate, collapsed, onToggle, user }: SidebarProps) {
  const { logout } = useAuth();
  const NavLink = ({ item }: { item: NavItem }) => {
    const isActive = active === item.id;
    return (
      <button
        onClick={() => onNavigate(item.id)}
        title={collapsed ? item.label : undefined}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 group relative ${
          isActive
            ? 'bg-white/10 text-white'
            : 'text-[#94A3B8] hover:text-white hover:bg-white/5'
        }`}
      >
        <span className={`shrink-0 transition-colors ${isActive ? 'text-white' : 'text-[#64748B] group-hover:text-[#94A3B8]'}`}>
          {item.icon}
        </span>
        {!collapsed && <span className="truncate">{item.label}</span>}
        {!collapsed && item.badge !== undefined && (
          <span className="ml-auto bg-[#4F46E5] text-white text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center">{item.badge}</span>
        )}
        {collapsed && item.badge !== undefined && (
          <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-[#4F46E5] rounded-full" />
        )}
        {isActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-[#4F46E5] rounded-full" />}
      </button>
    );
  };

  return (
    <aside
      className="flex flex-col h-full bg-[#0F172A] border-r border-white/5 sidebar-transition"
      style={{ width: collapsed ? 72 : 240 }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/5 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-[#4F46E5] flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </div>
        {!collapsed && (
          <div>
            <span className="text-white font-bold text-base tracking-tight">ProCaller</span>
            <span className="block text-[10px] text-[#4F46E5] font-medium tracking-widest uppercase">AP Infotech</span>
          </div>
        )}
      </div>

      {/* Scrollable nav */}
      <div className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.filter((item) => {
          if (item.id === 'dialer') return can(user, 'manual_call') || can(user, 'preview_auto_dial');
          if (item.id === 'campaigns') return can(user, 'create_campaign') || can(user, 'edit_campaign') || can(user, 'preview_auto_dial');
          if (item.id === 'team') return can(user, 'manage_user') || can(user, 'manage_manager') || can(user, 'manage_admin');
          if (item.id === 'analytics' || item.id === 'reports') return can(user, 'view_reports');
          if (item.id === 'call_history' || item.id === 'recordings') return can(user, 'view_call_logs');
          if (item.id === 'live_ops') return can(user, 'view_reports') || can(user, 'manage_user');
          if (item.id === 'call_queue') return can(user, 'manage_calling_settings');
          return true;
        }).map(item => <NavLink key={item.id} item={item} />)}

        {can(user, 'manage_agency') && (
          <NavLink item={{ id: 'agencies', label: 'Agencies', icon: <Icon path="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /> }} />
        )}

        {!collapsed && (
          <div className="pt-4 pb-1">
            <p className="px-3 text-[10px] font-semibold text-[#475569] uppercase tracking-widest mb-1">Administration</p>
          </div>
        )}
        {collapsed && <div className="my-3 border-t border-white/5" />}
        {adminItems.filter((item) => {
          if (item.id === 'audit_logs') return can(user, 'view_audit_logs');
          if (['billing', 'security', 'phone_numbers', 'ivr', 'integrations'].includes(item.id)) {
            return can(user, 'manage_calling_settings') || can(user, 'manage_agency');
          }
          return true;
        }).map(item => <NavLink key={item.id} item={item} />)}
      </div>

      {/* Bottom: user + collapse */}
      <div className="shrink-0 border-t border-white/5 p-3 space-y-2">
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[#64748B] hover:text-[#94A3B8] hover:bg-white/5 transition-all text-xs"
        >
          <svg className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
          {!collapsed && <span>Collapse</span>}
        </button>

        <div className={`flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/5 transition cursor-pointer ${collapsed ? 'justify-center' : ''}`} onClick={logout} title="Sign out">
          <div className="w-7 h-7 rounded-full bg-[#4F46E5] flex items-center justify-center text-white text-xs font-bold shrink-0">{user?.avatar_initials || 'PC'}</div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.display_name || 'Agent'}</p>
              <p className="text-xs text-[#64748B] truncate">{roleLabel(user?.role_normalized || user?.role)}</p>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
