import React, { useEffect, useState } from 'react';
import { Badge, Button, SearchInput, CallStatusBadge, Avatar, Drawer } from '../ui/index';
import { api } from '../../api/client';
import type { CallRecord } from '../../api/types';

const dirVariant = (d: string) => d === 'Outbound' ? 'default' as const : 'info' as const;

type HistoryRow = CallRecord & { agent: string; hasRecording: boolean };

export default function CallHistory({ onViewRecording }: { onViewRecording: () => void }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [detail, setDetail] = useState<HistoryRow | null>(null);

  useEffect(() => {
    api<CallRecord[]>('/api/calls/').then((calls) => {
      setRows(calls.map((c) => ({ ...c, agent: c.agent_name, hasRecording: false })));
    }).catch(() => undefined);
  }, []);

  const filtered = rows.filter(c => {
    const matchSearch = c.customer.toLowerCase().includes(search.toLowerCase()) || c.agent.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || c.direction.toLowerCase() === filter || c.status.toLowerCase().replace(' ', '_') === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#F8FAFC] fade-in">
      {/* Toolbar */}
      <div className="bg-white border-b border-[#E2E8F0] px-6 py-3 flex items-center gap-3 shrink-0">
        <div className="w-64">
          <SearchInput placeholder="Search calls..." value={search} onChange={setSearch} />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id: 'all', label: 'All' },
            { id: 'outbound', label: 'Outbound' },
            { id: 'inbound', label: 'Inbound' },
            { id: 'connected', label: 'Connected' },
            { id: 'no_answer', label: 'No Answer' },
            { id: 'missed', label: 'Missed' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === f.id ? 'bg-[#4F46E5] text-white' : 'bg-white border border-[#E2E8F0] text-slate-500 hover:border-[#4F46E5]/30'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <input type="date" className="h-9 rounded-lg border border-[#E2E8F0] px-3 text-sm focus:outline-none" />
          <Button variant="outline" size="sm">Export CSV</Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#F8FAFC] border-b border-[#E2E8F0] z-10">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Customer</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Agent</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Campaign</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Direction</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Duration</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date & Time</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Disposition</th>
              <th className="w-24 px-3 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">Recording</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-[#F1F5F9]">
            {filtered.map(call => (
              <tr key={call.id} className="hover:bg-slate-50 transition-colors group cursor-pointer" onClick={() => setDetail(call)}>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar initials={call.customer.split(' ').map(w => w[0]).join('')} size="sm" />
                    <span className="font-medium text-slate-800">{call.customer}</span>
                  </div>
                </td>
                <td className="px-3 py-3.5 text-slate-600 text-xs">{call.agent}</td>
                <td className="px-3 py-3.5 text-xs text-slate-500">{call.campaign}</td>
                <td className="px-3 py-3.5"><Badge variant={dirVariant(call.direction)}>{call.direction}</Badge></td>
                <td className="px-3 py-3.5"><CallStatusBadge status={call.status} /></td>
                <td className="px-3 py-3.5 font-mono text-xs text-slate-600">{call.duration || '—'}</td>
                <td className="px-3 py-3.5 text-xs text-slate-500">{call.date ? new Date(call.date).toLocaleString('en-IN') : '—'}</td>
                <td className="px-3 py-3.5">
                  <span className="text-xs text-slate-500">{call.disposition}</span>
                </td>
                <td className="px-3 py-3.5 text-right">
                  {call.hasRecording ? (
                    <button
                      onClick={e => { e.stopPropagation(); onViewRecording(); }}
                      className="inline-flex items-center gap-1 text-xs text-[#4F46E5] font-medium hover:underline"
                    >
                      ▶ Play
                    </button>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="bg-white border-t border-[#E2E8F0] px-6 py-3 flex items-center justify-between shrink-0">
        <p className="text-sm text-slate-500">Showing {filtered.length} of {rows.length} calls</p>
        <div className="flex items-center gap-1">
          {['←','1','2','3','→'].map(p => (
            <button key={p} className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm ${p === '1' ? 'bg-[#4F46E5] text-white' : 'text-slate-500 hover:bg-slate-100'}`}>{p}</button>
          ))}
        </div>
      </div>

      {/* Call Detail Drawer */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} title="Call Details">
        {detail && (
          <div className="space-y-6">
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="flex items-center gap-3 mb-3">
                <Avatar initials={detail.customer.split(' ').map(w => w[0]).join('')} size="md" />
                <div>
                  <p className="font-semibold text-slate-900">{detail.customer}</p>
                  <p className="text-xs text-slate-400">{detail.date}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-slate-400 mb-0.5">Agent</p><p className="font-medium text-slate-700">{detail.agent}</p></div>
                <div><p className="text-xs text-slate-400 mb-0.5">Duration</p><p className="font-mono font-medium text-slate-700">{detail.duration || '—'}</p></div>
                <div><p className="text-xs text-slate-400 mb-0.5">Status</p><CallStatusBadge status={detail.status} /></div>
                <div><p className="text-xs text-slate-400 mb-0.5">Direction</p><Badge variant={dirVariant(detail.direction)}>{detail.direction}</Badge></div>
                <div className="col-span-2"><p className="text-xs text-slate-400 mb-0.5">Disposition</p><p className="font-medium text-slate-700">{detail.disposition}</p></div>
              </div>
            </div>

            {detail.hasRecording && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Recording</p>
                <div className="bg-slate-50 rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <button className="w-10 h-10 rounded-full bg-[#4F46E5] flex items-center justify-center text-white text-sm shadow-lg shadow-indigo-200 hover:bg-[#4338CA] transition-colors">
                      ▶
                    </button>
                    <div className="flex-1">
                      <div className="h-1.5 bg-slate-200 rounded-full relative">
                        <div className="h-full w-1/3 bg-[#4F46E5] rounded-full" />
                        <div className="absolute top-1/2 -translate-y-1/2 left-1/3 w-3 h-3 bg-white border-2 border-[#4F46E5] rounded-full -ml-1.5" />
                      </div>
                    </div>
                    <span className="text-xs font-mono text-slate-500">{detail.duration}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>1.0x speed</span>
                    <button onClick={onViewRecording} className="text-[#4F46E5] font-medium hover:underline">View AI Insights →</button>
                  </div>
                </div>
              </div>
            )}

            {detail.hasRecording && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-5 h-5 rounded bg-purple-100 text-purple-600 flex items-center justify-center text-[10px] font-bold">AI</span>
                  <p className="text-xs font-semibold text-slate-700">AI Summary</p>
                </div>
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                  <p className="text-sm text-slate-700 leading-relaxed">
                    Customer expressed interest in the premium plan. Requested pricing document and follow-up call. Budget approval pending from CFO.
                  </p>
                  <div className="flex gap-2 mt-3">
                    <Badge variant="success">Positive Sentiment</Badge>
                    <Badge variant="default">Pricing</Badge>
                    <Badge variant="default">Follow-up</Badge>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
