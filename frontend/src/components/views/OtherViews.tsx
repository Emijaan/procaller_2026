import React, { useState } from 'react';
import { Card, Button, Badge, Avatar } from '../ui/index';

// ─── Call Queue ───────────────────────────────────────────────────────────────
export function CallQueue() {
  return (
    <div className="flex-1 overflow-y-auto bg-[#F8FAFC] fade-in p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Active Queues</h2>
          <Button variant="primary" size="sm">+ New Queue</Button>
        </div>
        {[
          { name: 'Sales Alpha Queue', waiting: 8, available: 2, priority: 'High', avgWait: '1:20' },
          { name: 'Inbound Support', waiting: 3, available: 0, priority: 'High', avgWait: '3:12' },
          { name: 'Sales Beta Queue', waiting: 4, available: 1, priority: 'Medium', avgWait: '0:45' },
          { name: 'VIP Queue', waiting: 1, available: 2, priority: 'High', avgWait: '0:12' },
        ].map(q => (
          <Card key={q.name} className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-slate-900">{q.name}</h3>
                <Badge variant={q.priority === 'High' ? 'danger' : q.priority === 'Medium' ? 'warning' : 'muted'} className="mt-1">{q.priority} Priority</Badge>
              </div>
              <Button variant="outline" size="sm">Configure</Button>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center bg-slate-50 rounded-xl p-3">
                <p className={`text-2xl font-bold ${q.waiting > 5 ? 'text-red-500' : q.waiting > 2 ? 'text-amber-500' : 'text-green-600'}`}>{q.waiting}</p>
                <p className="text-xs text-slate-400 mt-0.5">Waiting</p>
              </div>
              <div className="text-center bg-slate-50 rounded-xl p-3">
                <p className={`text-2xl font-bold ${q.available === 0 ? 'text-red-500' : 'text-green-600'}`}>{q.available}</p>
                <p className="text-xs text-slate-400 mt-0.5">Available</p>
              </div>
              <div className="text-center bg-slate-50 rounded-xl p-3">
                <p className="text-2xl font-bold font-mono text-slate-900">{q.avgWait}</p>
                <p className="text-xs text-slate-400 mt-0.5">Avg Wait</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── IVR Builder ──────────────────────────────────────────────────────────────
export function IVR() {
  return (
    <div className="flex-1 overflow-y-auto bg-[#F8FAFC] fade-in p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-semibold text-slate-700">IVR Flow Builder</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm">Save Draft</Button>
            <Button variant="primary" size="sm">Publish Flow</Button>
          </div>
        </div>

        {/* Visual IVR */}
        <div className="flex flex-col items-center gap-4">
          {/* Start node */}
          <div className="bg-green-50 border-2 border-green-300 rounded-xl px-6 py-3 text-sm font-semibold text-green-800 flex items-center gap-2">
            📞 Incoming Call
          </div>
          <div className="w-0.5 h-6 bg-[#E2E8F0]" />

          {/* Greeting */}
          <Card className="p-4 w-72 border-2 border-blue-200 bg-blue-50">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-blue-500">🔊</span>
              <span className="text-sm font-semibold text-blue-900">Play Greeting</span>
            </div>
            <p className="text-xs text-blue-600 italic">"Thank you for calling ProCaller. Please listen to the following options."</p>
          </Card>
          <div className="w-0.5 h-6 bg-[#E2E8F0]" />

          {/* Menu */}
          <Card className="p-4 w-72 border-2 border-[#4F46E5]/30 bg-[#EEF2FF]">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[#4F46E5]">☰</span>
              <span className="text-sm font-semibold text-[#4F46E5]">IVR Menu</span>
            </div>
            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex items-center gap-2"><kbd className="bg-white border px-1.5 py-0.5 rounded font-mono">1</kbd> → Sales</div>
              <div className="flex items-center gap-2"><kbd className="bg-white border px-1.5 py-0.5 rounded font-mono">2</kbd> → Support</div>
              <div className="flex items-center gap-2"><kbd className="bg-white border px-1.5 py-0.5 rounded font-mono">3</kbd> → Billing</div>
              <div className="flex items-center gap-2"><kbd className="bg-white border px-1.5 py-0.5 rounded font-mono">0</kbd> → Operator</div>
            </div>
          </Card>

          <div className="flex gap-12">
            {['Sales', 'Support', 'Billing', 'Operator'].map(option => (
              <div key={option} className="flex flex-col items-center gap-2">
                <div className="w-0.5 h-8 bg-[#E2E8F0]" />
                <div className="bg-slate-100 border border-[#E2E8F0] rounded-xl px-4 py-2 text-xs font-semibold text-slate-600">
                  {option === 'Operator' ? '👤 Agent' : `📋 ${option} Queue`}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 p-4 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-800">
          💡 Drag and drop nodes to build your IVR flow. Connect nodes to define the call routing logic.
        </div>
      </div>
    </div>
  );
}

// ─── Integrations ─────────────────────────────────────────────────────────────
export function Integrations({ showToast }: { showToast: (msg: string, type?: 'success' | 'info' | 'error') => void }) {
  const integrations = [
    { name: 'Salesforce', category: 'CRM', icon: '☁️', connected: true, desc: 'Sync contacts and call logs with Salesforce CRM' },
    { name: 'HubSpot', category: 'CRM', icon: '🟠', connected: true, desc: 'Two-way sync with HubSpot contacts and deals' },
    { name: 'Zoho CRM', category: 'CRM', icon: '🔵', connected: false, desc: 'Connect with Zoho CRM for lead management' },
    { name: 'Slack', category: 'Communication', icon: '💬', connected: true, desc: 'Get call notifications and alerts in Slack' },
    { name: 'Google Calendar', category: 'Calendar', icon: '📅', connected: false, desc: 'Sync follow-ups with Google Calendar' },
    { name: 'Microsoft 365', category: 'Calendar', icon: '🔷', connected: false, desc: 'Connect with Outlook and Teams' },
    { name: 'Zapier', category: 'Automation', icon: '⚡', connected: true, desc: 'Connect ProCaller with 5000+ apps via Zapier' },
    { name: 'Make (Integromat)', category: 'Automation', icon: '🔗', connected: false, desc: 'Advanced automation with Make.com' },
    { name: 'Webhooks', category: 'Developer', icon: '🔧', connected: true, desc: 'Custom webhook endpoints for any integration' },
  ];

  const categories = [...new Set(integrations.map(i => i.category))];

  return (
    <div className="flex-1 overflow-y-auto bg-[#F8FAFC] fade-in p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {categories.map(cat => (
          <div key={cat}>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">{cat}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {integrations.filter(i => i.category === cat).map(integration => (
                <Card key={integration.name} className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-50 border border-[#E2E8F0] flex items-center justify-center text-xl">
                        {integration.icon}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 text-sm">{integration.name}</p>
                        <Badge variant={integration.connected ? 'success' : 'muted'} className="mt-0.5">
                          {integration.connected ? '● Connected' : 'Not connected'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mb-3">{integration.desc}</p>
                  <Button
                    variant={integration.connected ? 'outline' : 'primary'}
                    size="sm"
                    className="w-full"
                    onClick={() => showToast(integration.connected ? `Disconnected ${integration.name}` : `Connected ${integration.name}`, integration.connected ? 'info' : 'success')}
                  >
                    {integration.connected ? 'Configure' : 'Connect'}
                  </Button>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Reports ──────────────────────────────────────────────────────────────────
export function Reports() {
  return (
    <div className="flex-1 overflow-y-auto bg-[#F8FAFC] fade-in p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Saved Reports</h2>
          <Button variant="primary" size="sm">+ Create Report</Button>
        </div>
        {[
          { name: 'Daily Call Summary', schedule: 'Every day at 6 PM', lastRun: 'Today 18:00', type: 'Call Report' },
          { name: 'Weekly Agent Performance', schedule: 'Every Monday 8 AM', lastRun: 'Sep 14, 2026', type: 'Agent Report' },
          { name: 'Campaign Conversion Report', schedule: 'On demand', lastRun: 'Sep 18, 2026', type: 'Campaign Report' },
          { name: 'Monthly Lead Funnel', schedule: '1st of month', lastRun: 'Sep 1, 2026', type: 'Lead Report' },
        ].map(r => (
          <Card key={r.name} className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-xl">📊</div>
            <div className="flex-1">
              <p className="font-semibold text-slate-900">{r.name}</p>
              <p className="text-xs text-slate-400">{r.schedule} · Last run: {r.lastRun}</p>
            </div>
            <Badge variant="default">{r.type}</Badge>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">Run Now</Button>
              <Button variant="ghost" size="sm">⬇ CSV</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
