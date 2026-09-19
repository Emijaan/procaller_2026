import React, { useState } from 'react';
import { Card, Badge, Button, ProgressBar, Modal } from '../ui/index';
import { campaigns } from '../../data/mock';

const statusVariant = (s: string): 'success' | 'warning' | 'danger' | 'muted' | 'info' | 'default' | 'purple' => {
  const m: Record<string, 'success' | 'warning' | 'danger' | 'muted' | 'info' | 'default' | 'purple'> = {
    Running: 'success', Paused: 'warning', Draft: 'muted', Completed: 'info', Archived: 'muted',
  };
  return m[s] || 'muted';
};

export default function Campaigns({ showToast }: { showToast: (msg: string, type?: 'success' | 'info' | 'error') => void }) {
  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState(1);
  const totalSteps = 6;

  const steps = ['Details', 'Import Leads', 'Assign Agents', 'Dialing Strategy', 'Schedule', 'Review'];

  return (
    <div className="flex-1 overflow-y-auto bg-[#F8FAFC] fade-in">
      <div className="max-w-[1200px] mx-auto px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {[
              { label: 'All', count: campaigns.length },
              { label: 'Running', count: campaigns.filter(c => c.status === 'Running').length },
              { label: 'Paused', count: campaigns.filter(c => c.status === 'Paused').length },
              { label: 'Completed', count: campaigns.filter(c => c.status === 'Completed').length },
            ].map(tab => (
              <button key={tab.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-white border border-[#E2E8F0] hover:border-[#4F46E5]/30 transition-all text-slate-600">
                {tab.label}
                <span className="bg-slate-100 text-slate-500 text-xs px-1.5 py-0.5 rounded-full">{tab.count}</span>
              </button>
            ))}
          </div>
          <Button variant="primary" size="md" onClick={() => setShowCreate(true)}>+ New Campaign</Button>
        </div>

        {/* Campaign grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {campaigns.map(camp => (
            <Card key={camp.id} className="p-5 hover:shadow-md cursor-pointer transition-all">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-slate-900 text-base">{camp.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{camp.mode} · {camp.agents} agents</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(camp.status)} dot={camp.status === 'Running'}>{camp.status}</Badge>
                  <button className="text-slate-300 hover:text-slate-500 transition-colors">⋯</button>
                </div>
              </div>

              {/* Progress */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                  <span>{camp.calls} calls made</span>
                  <span>{Math.round((camp.calls / Math.max(camp.leads, 1)) * 100)}% complete</span>
                </div>
                <ProgressBar value={camp.calls} max={Math.max(camp.leads, 1)} />
                <p className="text-[10px] text-slate-400 mt-1">{camp.leads - camp.calls} leads remaining</p>
              </div>

              {/* Metrics */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Answer Rate', value: `${camp.answerRate}%`, color: camp.answerRate > 65 ? 'text-green-600' : 'text-amber-600' },
                  { label: 'Interested', value: camp.interested, color: 'text-indigo-600' },
                  { label: 'Conversions', value: camp.conversions, color: 'text-purple-600' },
                ].map(m => (
                  <div key={m.label} className="bg-slate-50 rounded-lg p-2 text-center">
                    <p className={`text-sm font-bold ${m.color}`}>{m.value}</p>
                    <p className="text-[10px] text-slate-400">{m.label}</p>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-[#E2E8F0]">
                {camp.status === 'Running' ? (
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => showToast(`${camp.name} paused`, 'info')}>⏸ Pause</Button>
                ) : camp.status === 'Paused' ? (
                  <Button variant="primary" size="sm" className="flex-1" onClick={() => showToast(`${camp.name} resumed`, 'success')}>▶ Resume</Button>
                ) : camp.status === 'Draft' ? (
                  <Button variant="primary" size="sm" className="flex-1" onClick={() => showToast(`${camp.name} launched!`, 'success')}>🚀 Launch</Button>
                ) : (
                  <Button variant="secondary" size="sm" className="flex-1">View Report</Button>
                )}
                <Button variant="outline" size="sm">Analytics</Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Create Campaign Wizard */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setStep(1); }} title="New Campaign" size="lg">
        <div className="space-y-6">
          {/* Steps */}
          <div className="flex items-center gap-1">
            {steps.map((s, i) => (
              <React.Fragment key={s}>
                <div className={`flex items-center gap-1.5 ${i < step - 1 ? 'text-[#4F46E5]' : i === step - 1 ? 'text-[#4F46E5] font-semibold' : 'text-slate-300'}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i < step - 1 ? 'bg-[#4F46E5] text-white' : i === step - 1 ? 'bg-[#EEF2FF] text-[#4F46E5] border-2 border-[#4F46E5]' : 'bg-slate-100 text-slate-400'}`}>
                    {i < step - 1 ? '✓' : i + 1}
                  </div>
                  <span className="text-xs hidden sm:inline">{s}</span>
                </div>
                {i < steps.length - 1 && <div className={`flex-1 h-0.5 ${i < step - 1 ? 'bg-[#4F46E5]' : 'bg-slate-100'}`} />}
              </React.Fragment>
            ))}
          </div>

          {/* Step content */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700">Campaign Details</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Campaign Name</label>
                  <input className="w-full h-9 rounded-lg border border-[#E2E8F0] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30" placeholder="e.g. Q4 Enterprise Outreach" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Description</label>
                  <textarea className="w-full h-20 rounded-lg border border-[#E2E8F0] px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30" placeholder="What is this campaign about?" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Start Date</label>
                    <input type="date" className="w-full h-9 rounded-lg border border-[#E2E8F0] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">End Date</label>
                    <input type="date" className="w-full h-9 rounded-lg border border-[#E2E8F0] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700">Import Leads</h3>
              <div className="border-2 border-dashed border-[#E2E8F0] rounded-xl p-10 text-center hover:border-[#4F46E5]/40 transition-colors cursor-pointer">
                <div className="text-3xl mb-2">📊</div>
                <p className="text-sm font-medium text-slate-700">Drop CSV file or click to browse</p>
                <p className="text-xs text-slate-400 mt-1">Supports Name, Phone, Email, Company columns</p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700">Assign Agents</h3>
              {['Rahul Sharma','Priya Singh','Amit Verma','Anjali Mehta'].map(agent => (
                <label key={agent} className="flex items-center gap-3 p-3 rounded-xl border border-[#E2E8F0] cursor-pointer hover:bg-slate-50 transition-colors">
                  <input type="checkbox" defaultChecked={agent !== 'Amit Verma'} className="rounded accent-[#4F46E5]" />
                  <span className="text-sm font-medium text-slate-700">{agent}</span>
                  <span className="ml-auto text-xs text-slate-400">Available</span>
                </label>
              ))}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700">Dialing Strategy</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'progressive', label: 'Progressive', desc: 'Auto-dial next lead after call ends' },
                  { id: 'power', label: 'Power', desc: 'Dial multiple leads simultaneously' },
                  { id: 'preview', label: 'Preview', desc: 'Agent reviews lead before calling' },
                  { id: 'manual', label: 'Manual', desc: 'Agent manually initiates each call' },
                ].map(mode => (
                  <label key={mode.id} className="flex items-start gap-3 p-4 rounded-xl border border-[#E2E8F0] cursor-pointer hover:border-[#4F46E5]/40 transition-colors">
                    <input type="radio" name="mode" value={mode.id} defaultChecked={mode.id === 'progressive'} className="mt-0.5 accent-[#4F46E5]" />
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{mode.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{mode.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step >= 5 && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-slate-700">{step === 5 ? 'Schedule' : 'Review & Launch'}</h3>
              {step === 5 ? (
                <div className="space-y-3">
                  {['Mon','Tue','Wed','Thu','Fri'].map(day => (
                    <div key={day} className="flex items-center gap-3">
                      <span className="text-sm text-slate-600 w-10">{day}</span>
                      <input type="time" defaultValue="09:00" className="h-8 rounded-lg border border-[#E2E8F0] px-2 text-sm focus:outline-none" />
                      <span className="text-slate-400">—</span>
                      <input type="time" defaultValue="18:00" className="h-8 rounded-lg border border-[#E2E8F0] px-2 text-sm focus:outline-none" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
                  <div className="text-3xl mb-2">🚀</div>
                  <p className="text-sm font-semibold text-green-800">Ready to Launch</p>
                  <p className="text-xs text-green-600 mt-1">Review your settings and click Launch Campaign</p>
                </div>
              )}
            </div>
          )}

          {/* Nav */}
          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" size="md" onClick={() => step > 1 ? setStep(p => p - 1) : setShowCreate(false)}>
              {step > 1 ? '← Back' : 'Cancel'}
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => {
                if (step < totalSteps) { setStep(p => p + 1); }
                else { setShowCreate(false); setStep(1); showToast('Campaign created and launched!', 'success'); }
              }}
            >
              {step < totalSteps ? 'Continue →' : '🚀 Launch Campaign'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
