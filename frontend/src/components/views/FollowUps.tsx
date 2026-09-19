import React, { useState } from 'react';
import { Badge, Button, Avatar } from '../ui/index';
import { followUps } from '../../data/mock';

export default function FollowUps({ showToast }: { showToast: (msg: string, type?: 'success' | 'info' | 'error') => void }) {
  const [tab, setTab] = useState('today');
  const tabs = [
    { id: 'today', label: 'Today', count: followUps.filter(f => f.status === 'due').length },
    { id: 'overdue', label: 'Overdue', count: followUps.filter(f => f.status === 'overdue').length },
    { id: 'upcoming', label: 'Upcoming', count: followUps.filter(f => f.status === 'upcoming').length },
    { id: 'completed', label: 'Completed', count: 14 },
  ];

  const display = followUps.filter(f =>
    tab === 'today' ? f.status === 'due' :
    tab === 'overdue' ? f.status === 'overdue' :
    tab === 'upcoming' ? f.status === 'upcoming' :
    false
  );

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#F8FAFC] fade-in">
      <div className="bg-white border-b border-[#E2E8F0] px-6 py-3 flex items-center gap-4 shrink-0">
        <div className="flex gap-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-[#4F46E5] text-white' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              {t.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-white/20' : 'bg-slate-100'}`}>{t.count}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <Button variant="primary" size="sm">+ Schedule Follow-up</Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-3">
          {display.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-sm font-semibold text-slate-700">All clear!</p>
              <p className="text-sm text-slate-400 mt-1">No follow-ups in this category</p>
            </div>
          ) : display.map(f => (
            <div
              key={f.id}
              className={`bg-white border rounded-xl p-4 flex items-center gap-4 hover:shadow-sm transition-all ${
                f.status === 'overdue' ? 'border-red-200 bg-red-50/30' : 'border-[#E2E8F0]'
              }`}
            >
              <div className={`w-1 h-14 rounded-full shrink-0 ${f.status === 'overdue' ? 'bg-red-400' : f.priority === 'High' ? 'bg-amber-400' : 'bg-slate-200'}`} />

              <Avatar initials={f.customer.split(' ').map(w => w[0]).join('')} size="md" />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-slate-900">{f.customer}</span>
                  {f.status === 'overdue' && <Badge variant="danger">Overdue</Badge>}
                  <Badge variant={f.priority === 'High' ? 'warning' : f.priority === 'Medium' ? 'info' : 'muted'}>{f.priority}</Badge>
                </div>
                <p className="text-sm text-slate-500">{f.reason}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {f.agent} · {f.dueDate} at {f.dueTime}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => showToast(`Calling ${f.customer}...`, 'info')}
                >
                  📞 Call
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => showToast('Follow-up rescheduled', 'info')}
                >
                  Reschedule
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => showToast('Marked complete', 'success')}
                >
                  ✓ Done
                </Button>
              </div>
            </div>
          ))}

          {tab === 'completed' && (
            <div className="text-center py-12 text-slate-400">
              <p className="text-sm">14 completed follow-ups today</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
