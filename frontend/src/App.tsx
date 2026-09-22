import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import Login from './components/views/Login';
import Dashboard from './components/views/Dashboard';
import Dialer from './components/views/Dialer';
import Contacts from './components/views/Contacts';
import Leads from './components/views/Leads';
import Campaigns from './components/views/Campaigns';
import CallHistory from './components/views/CallHistory';
import Analytics from './components/views/Analytics';
import LiveOps from './components/views/LiveOps';
import Team from './components/views/Team';
import Recordings from './components/views/Recordings';
import FollowUps from './components/views/FollowUps';
import Agencies from './components/views/Agencies';
import Reports from './components/views/Reports';
import { CallQueue, IVR, Integrations } from './components/views/OtherViews';
import { ToastContainer, useToast } from './components/ui/index';
import { useAuth } from './context/AuthContext';

// ─── Command Palette ─────────────────────────────────────────────────────────
const commands = [
  { label: 'Go to Dashboard', view: 'dashboard', icon: '🏠' },
  { label: 'Open Dialer', view: 'dialer', icon: '📞' },
  { label: 'View Contacts', view: 'contacts', icon: '👥' },
  { label: 'View Leads', view: 'leads', icon: '📊' },
  { label: 'Campaigns', view: 'campaigns', icon: '🎯' },
  { label: 'Live Operations', view: 'live_ops', icon: '🟢' },
  { label: 'Analytics', view: 'analytics', icon: '📈' },
  { label: 'Recordings', view: 'recordings', icon: '🎙' },
  { label: 'Follow-ups', view: 'followups', icon: '📅' },
  { label: 'Team', view: 'team', icon: '👤' },
  { label: 'Call History', view: 'call_history', icon: '📋' },
  { label: 'Settings', view: 'settings', icon: '⚙️' },
  { label: 'Billing', view: 'billing', icon: '💳' },
  { label: 'Security', view: 'security', icon: '🔐' },
  { label: 'Audit Logs', view: 'audit_logs', icon: '📝' },
  { label: 'Integrations', view: 'integrations', icon: '🔗' },
  { label: 'Phone Numbers', view: 'phone_numbers', icon: '📱' },
  { label: 'IVR & Call Flows', view: 'ivr', icon: '🔀' },
  { label: 'Reports', view: 'reports', icon: '📄' },
];

function CommandPalette({ onNavigate, onClose }: { onNavigate: (v: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);

  const filtered = commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()));

  useEffect(() => { setCursor(0); }, [query]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(p => Math.min(p + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(p => Math.max(p - 1, 0)); }
    if (e.key === 'Enter' && filtered[cursor]) { onNavigate(filtered[cursor].view); onClose(); }
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-24 px-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden fade-in">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E2E8F0]">
          <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            autoFocus
            type="text"
            placeholder="Search or jump to..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            className="flex-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <kbd className="text-[10px] font-mono bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded">Esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-400">No results for "{query}"</div>
          ) : filtered.map((cmd, i) => (
            <button
              key={cmd.view}
              onClick={() => { onNavigate(cmd.view); onClose(); }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${i === cursor ? 'bg-[#EEF2FF]' : 'hover:bg-slate-50'}`}
            >
              <span className="w-7 h-7 flex items-center justify-center text-base">{cmd.icon}</span>
              <span className={`text-sm font-medium ${i === cursor ? 'text-[#4F46E5]' : 'text-slate-700'}`}>{cmd.label}</span>
              {i === cursor && <kbd className="ml-auto text-[10px] font-mono bg-[#4F46E5]/10 text-[#4F46E5] px-1.5 py-0.5 rounded">↵</kbd>}
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-[#E2E8F0] flex items-center gap-4 text-[10px] text-slate-400">
          <span>↑↓ Navigate</span>
          <span>↵ Select</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const { user, loading } = useAuth();
  const [view, setView] = useState('dialer');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [showCommand, setShowCommand] = useState(false);
  const { toasts, show: showToast, dismiss } = useToast();

  // Dark mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCommand(p => !p);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const navigate = useCallback((v: string) => {
    // Settings sub-sections map to settings view
    if (['phone_numbers', 'security', 'billing', 'audit_logs'].includes(v)) {
      setView('settings');
    } else {
      setView(v);
    }
    setShowCommand(false);
  }, []);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F8FAFC] text-slate-500 text-sm">
        Loading ProCaller...
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const renderView = () => {
    switch (view) {
      case 'agencies': return <Agencies showToast={showToast} />;
      case 'dashboard': return <Dashboard onNavigate={navigate} />;
      case 'dialer': return <Dialer showToast={showToast} />;
      case 'contacts': return <Contacts showToast={showToast} onCall={(phone) => { sessionStorage.setItem('procaller.pendingDial', phone); navigate('dialer'); }} />;
      case 'leads': return <Leads showToast={showToast} />;
      case 'campaigns': return <Campaigns showToast={showToast} />;
      case 'call_history': return <CallHistory onViewRecording={() => navigate('recordings')} />;
      case 'call_queue': return <CallQueue />;
      case 'analytics': return <Analytics />;
      case 'live_ops': return <LiveOps showToast={showToast} />;
      case 'team': return <Team showToast={showToast} />;
      case 'recordings': return <Recordings showToast={showToast} />;
      case 'followups': return <FollowUps showToast={showToast} />;
      case 'settings': return <Settings showToast={showToast} />;
      case 'ivr': return <IVR />;
      case 'integrations': return <Integrations showToast={showToast} />;
      case 'reports': return <Reports />;
      default: return (
        <div className="flex-1 flex items-center justify-center bg-[#F8FAFC]">
          <div className="text-center">
            <div className="text-4xl mb-3">🚧</div>
            <p className="text-sm font-semibold text-slate-700">Coming soon</p>
            <p className="text-sm text-slate-400 mt-1">This section is under development</p>
          </div>
        </div>
      );
    }
  };

  return (
    <div className={`h-screen flex overflow-hidden ${isDark ? 'dark' : ''}`} style={{ background: 'var(--background)' }}>
      {/* Sidebar */}
      <Sidebar
        active={view}
        onNavigate={navigate}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(p => !p)}
        user={user}
      />

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Topbar
          view={view}
          onSearch={() => setShowCommand(true)}
          isDark={isDark}
          onToggleDark={() => setIsDark(p => !p)}
        />
        <main className="flex-1 overflow-hidden flex flex-col">
          {renderView()}
        </main>
      </div>

      {/* Command palette */}
      {showCommand && (
        <CommandPalette
          onNavigate={navigate}
          onClose={() => setShowCommand(false)}
        />
      )}

      {/* Toasts */}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
