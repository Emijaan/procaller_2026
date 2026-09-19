import React, { useEffect, useState } from 'react';
import { Card, Badge, Button, Avatar } from '../ui/index';
import { phoneNumbers } from '../../data/mock';
import { api } from '../../api/client';
import { can } from '../../api/access';
import { useAuth } from '../../context/AuthContext';

type AuditRow = {
  id: number;
  user_name?: string;
  action: string;
  object_type?: string;
  object_id?: string;
  created_at?: string;
  ip_address?: string | null;
};

const settingsNav = [
  { id: 'general', label: 'General', icon: '⚙️' },
  { id: 'org', label: 'Organization', icon: '🏢' },
  { id: 'users', label: 'Users & Roles', icon: '👥' },
  { id: 'phone', label: 'Phone Numbers', icon: '📞' },
  { id: 'notifications', label: 'Notifications', icon: '🔔' },
  { id: 'security', label: 'Security', icon: '🔐' },
  { id: 'billing', label: 'Billing', icon: '💳' },
  { id: 'developer', label: 'Developer', icon: '⌨️' },
  { id: 'audit', label: 'Audit Logs', icon: '📋' },
];

export default function Settings({ showToast }: { showToast: (msg: string, type?: 'success' | 'info' | 'error') => void }) {
  const { user } = useAuth();
  const [section, setSection] = useState('general');
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  useEffect(() => {
    if (section !== 'audit' || !can(user, 'view_audit_logs')) return;
    api<AuditRow[]>('/api/audit-logs/').then(setAuditLogs).catch((err) => showToast(err.message, 'error'));
  }, [section, user]);

  return (
    <div className="flex-1 overflow-hidden flex bg-[#F8FAFC] fade-in">
      {/* Settings sidebar */}
      <aside className="w-56 border-r border-[#E2E8F0] bg-white p-3 shrink-0 overflow-y-auto">
        <div className="space-y-0.5">
          {settingsNav.filter((item) => item.id !== 'audit' || can(user, 'view_audit_logs')).map(item => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all text-left ${section === item.id ? 'bg-[#EEF2FF] text-[#4F46E5] font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">

          {section === 'general' && (
            <>
              <h2 className="text-base font-semibold text-slate-900">General Settings</h2>
              <Card className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Organization Name</label>
                  <input defaultValue="AP Infotech and Cyber Solution" className="w-full h-9 rounded-lg border border-[#E2E8F0] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Default Timezone</label>
                  <select className="w-full h-9 rounded-lg border border-[#E2E8F0] px-3 text-sm focus:outline-none">
                    <option>Asia/Kolkata (IST, UTC+5:30)</option>
                    <option>America/New_York (EST)</option>
                    <option>America/Los_Angeles (PST)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Default Language</label>
                  <select className="w-full h-9 rounded-lg border border-[#E2E8F0] px-3 text-sm focus:outline-none">
                    <option>English (India)</option>
                    <option>English (US)</option>
                    <option>Hindi</option>
                  </select>
                </div>
                <Button variant="primary" size="md" onClick={() => showToast('Settings saved', 'success')}>Save Changes</Button>
              </Card>

              <Card className="p-5 space-y-4">
                <h3 className="text-sm font-semibold text-slate-700">Business Hours</h3>
                {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day, i) => (
                  <div key={day} className="flex items-center gap-3">
                    <input type="checkbox" defaultChecked={i < 5} className="rounded accent-[#4F46E5]" />
                    <span className="text-sm text-slate-600 w-10">{day}</span>
                    <input type="time" defaultValue="09:00" disabled={i >= 5} className="h-8 rounded-lg border border-[#E2E8F0] px-2 text-sm focus:outline-none disabled:opacity-40" />
                    <span className="text-slate-400">–</span>
                    <input type="time" defaultValue="18:00" disabled={i >= 5} className="h-8 rounded-lg border border-[#E2E8F0] px-2 text-sm focus:outline-none disabled:opacity-40" />
                  </div>
                ))}
              </Card>
            </>
          )}

          {section === 'phone' && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">Phone Numbers</h2>
                <Button variant="primary" size="sm" onClick={() => showToast('Opening number purchase...', 'info')}>+ Buy Number</Button>
              </div>
              <div className="space-y-3">
                {phoneNumbers.map(ph => (
                  <Card key={ph.id} className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 border border-[#E2E8F0] flex items-center justify-center text-lg">
                          {ph.country === 'India' ? '🇮🇳' : '🇺🇸'}
                        </div>
                        <div>
                          <p className="font-mono font-semibold text-slate-900">{ph.number}</p>
                          <p className="text-xs text-slate-400">{ph.type} · {ph.country}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right hidden sm:block">
                          <p className="text-xs text-slate-500">{ph.team || 'Unassigned'}</p>
                          <p className="text-xs text-slate-400">{ph.campaign || 'No campaign'}</p>
                        </div>
                        <Badge variant={ph.status === 'Active' ? 'success' : 'muted'}>{ph.status}</Badge>
                        <button className="text-slate-400 hover:text-slate-600 transition-colors">⋯</button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}

          {section === 'security' && (
            <>
              <h2 className="text-base font-semibold text-slate-900">Security</h2>
              <Card className="p-5 space-y-4">
                {[
                  { label: 'Two-Factor Authentication', desc: 'Require 2FA for all users', enabled: true },
                  { label: 'SSO / SAML', desc: 'Single sign-on via SAML 2.0', enabled: false },
                  { label: 'IP Restrictions', desc: 'Restrict access to specific IP ranges', enabled: false },
                  { label: 'Session Timeout', desc: 'Auto-logout after 30 minutes of inactivity', enabled: true },
                ].map(s => (
                  <div key={s.label} className="flex items-center justify-between py-2 border-b border-[#F1F5F9] last:border-0">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{s.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{s.desc}</p>
                    </div>
                    <div
                      className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${s.enabled ? 'bg-[#4F46E5]' : 'bg-slate-200'}`}
                      onClick={() => showToast(`${s.label} ${s.enabled ? 'disabled' : 'enabled'}`, 'info')}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${s.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                  </div>
                ))}
              </Card>

              <Card className="p-5">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Active Sessions</h3>
                <div className="space-y-2">
                  {[
                    { device: 'Chrome on MacOS', ip: '192.168.1.42', location: 'Mumbai, IN', time: 'Current session', current: true },
                    { device: 'Chrome on Windows', ip: '192.168.1.55', location: 'Delhi, IN', time: '2 hours ago', current: false },
                    { device: 'Safari on iPhone', ip: '192.168.1.10', location: 'Bangalore, IN', time: 'Yesterday', current: false },
                  ].map((session, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-xl border border-[#E2E8F0]">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-800">{session.device}</p>
                          {session.current && <Badge variant="success">Current</Badge>}
                        </div>
                        <p className="text-xs text-slate-400">{session.ip} · {session.location} · {session.time}</p>
                      </div>
                      {!session.current && (
                        <button onClick={() => showToast('Session revoked', 'success')} className="text-xs text-red-500 hover:underline font-medium">Revoke</button>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          {section === 'billing' && (
            <>
              <h2 className="text-base font-semibold text-slate-900">Billing & Usage</h2>
              <Card className="p-5 bg-gradient-to-r from-[#4F46E5] to-[#7C3AED] border-transparent text-white">
                <div className="flex items-start justify-between">
                  <div>
                    <Badge className="bg-white/20 text-white mb-2">Enterprise Plan</Badge>
                    <p className="text-2xl font-bold">₹49,999<span className="text-base font-normal opacity-70">/month</span></p>
                    <p className="text-sm opacity-70 mt-1">Billed annually · Next renewal Dec 1, 2026</p>
                  </div>
                  <Button variant="secondary" size="sm">Upgrade Plan</Button>
                </div>
              </Card>

              <Card className="p-5 space-y-4">
                <h3 className="text-sm font-semibold text-slate-700">Usage This Month</h3>
                {[
                  { label: 'Call Minutes', used: 42180, limit: 100000, unit: 'min' },
                  { label: 'Recording Storage', used: 18, limit: 100, unit: 'GB' },
                  { label: 'AI Transcriptions', used: 534, limit: 2000, unit: 'calls' },
                  { label: 'Active Users', used: 18, limit: 50, unit: 'users' },
                  { label: 'Phone Numbers', used: 4, limit: 20, unit: 'numbers' },
                ].map(usage => (
                  <div key={usage.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-slate-700">{usage.label}</span>
                      <span className="text-xs text-slate-500 font-mono">{usage.used.toLocaleString()} / {usage.limit.toLocaleString()} {usage.unit}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${(usage.used / usage.limit) > 0.8 ? 'bg-amber-400' : 'bg-[#4F46E5]'}`}
                        style={{ width: `${(usage.used / usage.limit) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </Card>
            </>
          )}

          {section === 'audit' && (
            <>
              <h2 className="text-base font-semibold text-slate-900">Audit Logs</h2>
              <Card className="overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-[#E2E8F0]">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">User</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Action</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Resource</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">IP</th>
                      <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1F5F9]">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Avatar initials={(log.user_name || 'UN').split(' ').map((w) => w[0]).join('').slice(0, 2) || 'UN'} size="sm" />
                            <span className="text-sm font-medium text-slate-700">{log.user_name || 'System'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-600">{log.action}</td>
                        <td className="px-3 py-3 text-xs text-slate-500">{[log.object_type, log.object_id].filter(Boolean).join(' #') || '—'}</td>
                        <td className="px-3 py-3 text-xs text-slate-400 font-mono">{(log.created_at || '').replace('T', ' ').slice(0, 19)}</td>
                        <td className="px-3 py-3 text-xs font-mono text-slate-400">{log.ip_address || '—'}</td>
                        <td className="px-3 py-3">
                          <Badge variant="success">Success</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}

          {section === 'developer' && (
            <>
              <h2 className="text-base font-semibold text-slate-900">Developer Settings</h2>
              <Card className="p-5 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-slate-700">API Keys</h3>
                    <Button variant="primary" size="sm" onClick={() => showToast('API key created — save it now, it won\'t be shown again', 'info')}>Create Key</Button>
                  </div>
                  <div className="space-y-2">
                    {['sk_live_***************XQR4', 'sk_live_***************MN92'].map((key, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-[#E2E8F0] bg-slate-50">
                        <code className="text-sm font-mono text-slate-700 flex-1">{key}</code>
                        <Badge variant={i === 0 ? 'success' : 'muted'}>{i === 0 ? 'Active' : 'Active'}</Badge>
                        <button onClick={() => showToast('API key revoked', 'success')} className="text-xs text-red-500 hover:underline font-medium">Revoke</button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-slate-700">Webhooks</h3>
                    <Button variant="outline" size="sm" onClick={() => showToast('Opening webhook creator...', 'info')}>Add Endpoint</Button>
                  </div>
                  <div className="space-y-2">
                    {[
                      { url: 'https://hooks.example.com/dialpro', events: 'call.ended, lead.updated', status: 'Active' },
                      { url: 'https://zapier.com/hooks/catch/...', events: 'recording.created', status: 'Active' },
                    ].map((webhook, i) => (
                      <div key={i} className="p-3 rounded-xl border border-[#E2E8F0]">
                        <p className="text-sm font-mono text-slate-700 truncate">{webhook.url}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{webhook.events}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </>
          )}

          {!['general','phone','security','billing','audit','developer'].includes(section) && (
            <div className="text-center py-20">
              <div className="text-4xl mb-3">{settingsNav.find(n => n.id === section)?.icon}</div>
              <p className="text-sm font-semibold text-slate-700">{settingsNav.find(n => n.id === section)?.label}</p>
              <p className="text-sm text-slate-400 mt-1">Settings for this section are available in the full version</p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
