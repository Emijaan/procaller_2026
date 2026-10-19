import React, { useEffect, useState } from 'react';
import { Badge, Button, Avatar } from '../ui/index';
import { api } from '../../api/client';

type FollowUpRow = {
  id: number;
  customer: string;
  phone: string;
  agent: string;
  reason: string;
  priority: string;
  due_at: string;
  bucket: 'today' | 'overdue' | 'upcoming' | 'completed';
  status: string;
};

function initials(name: string) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'PC';
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export default function FollowUps({ showToast }: { showToast: (msg: string, type?: 'success' | 'info' | 'error') => void }) {
  const [tab, setTab] = useState('today');
  const [rows, setRows] = useState<FollowUpRow[]>([]);

  const load = () => {
    api<FollowUpRow[]>('/api/followups/').then(setRows).catch((err) => showToast(err.message, 'error'));
  };
  useEffect(() => { load(); }, []);

  const tabs = [
    { id: 'today', label: 'Today', count: rows.filter((row) => row.bucket === 'today').length },
    { id: 'overdue', label: 'Overdue', count: rows.filter((row) => row.bucket === 'overdue').length },
    { id: 'upcoming', label: 'Upcoming', count: rows.filter((row) => row.bucket === 'upcoming').length },
    { id: 'completed', label: 'Completed', count: rows.filter((row) => row.bucket === 'completed').length },
  ];
  const display = rows.filter((row) => row.bucket === tab);

  const markDone = async (row: FollowUpRow) => {
    try {
      await api(`/api/followups/${row.id}/`, { method: 'PATCH', body: JSON.stringify({ status: 'done' }) });
      showToast('Marked complete', 'success');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update the follow-up', 'error');
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#F8FAFC] fade-in">
      <div className="bg-white border-b border-[#E2E8F0] px-6 py-3 flex items-center gap-4 shrink-0">
        <div className="flex gap-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === item.id ? 'bg-[#4F46E5] text-white' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              {item.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === item.id ? 'bg-white/20' : 'bg-slate-100'}`}>{item.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-3">
          {display.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-sm font-semibold text-slate-700">No follow-ups in this list</p>
              <p className="text-sm text-slate-400 mt-1">This page shows callbacks for you and the people who report to you.</p>
            </div>
          ) : display.map((row) => (
            <div
              key={row.id}
              className={`bg-white border rounded-xl p-4 flex items-center gap-4 hover:shadow-sm transition-all ${
                row.bucket === 'overdue' ? 'border-red-200 bg-red-50/30' : 'border-[#E2E8F0]'
              }`}
            >
              <div className={`w-1 h-14 rounded-full shrink-0 ${row.bucket === 'overdue' ? 'bg-red-400' : row.priority === 'High' ? 'bg-amber-400' : 'bg-slate-200'}`} />
              <Avatar initials={initials(row.customer)} size="md" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-slate-900">{row.customer || row.phone || 'Lead'}</span>
                  {row.bucket === 'overdue' && <Badge variant="danger">Overdue</Badge>}
                  <Badge variant={row.priority === 'High' ? 'warning' : row.priority === 'Medium' ? 'info' : 'muted'}>{row.priority}</Badge>
                </div>
                <p className="text-sm text-slate-500">{row.reason}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {row.agent}{row.phone ? ` · ${row.phone}` : ''} · {row.due_at ? new Date(row.due_at).toLocaleString('en-IN') : ''}
                </p>
              </div>
              {row.bucket !== 'completed' && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => markDone(row)}>✓ Done</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
