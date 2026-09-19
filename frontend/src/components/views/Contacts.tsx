import React, { useEffect, useState } from 'react';
import { Button, Badge, Avatar, SearchInput, ScoreRing, Drawer, Modal } from '../ui/index';
import { api } from '../../api/client';
import type { Contact as ApiContact } from '../../api/types';

const statusVariant = (s: string) => s === 'Active' ? 'success' as const : 'muted' as const;

type ContactRow = {
  id: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  status: string;
  owner: string;
  campaign: string;
  lastContact: string;
  tags: string[];
  leadScore: number;
};

function mapContact(c: ApiContact): ContactRow {
  return {
    id: String(c.id),
    name: c.name,
    phone: c.phone,
    email: c.email,
    company: c.company,
    status: c.status,
    owner: c.owner_name || '—',
    campaign: c.campaign_name || '',
    lastContact: c.last_contact_at ? c.last_contact_at.slice(0, 10) : '',
    tags: c.tags || [],
    leadScore: c.lead_score,
  };
}

export default function Contacts({ showToast, onCall }: { showToast: (msg: string, type?: 'success' | 'info' | 'error') => void; onCall?: (phone: string) => void }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [drawerContact, setDrawerContact] = useState<ContactRow | null>(null);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    api<ApiContact[]>('/api/contacts/').then((rows) => setContacts(rows.map(mapContact))).catch(() => undefined);
  }, []);

  const filtered = contacts.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    (c.company || '').toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id: string) =>
    setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const allSelected = filtered.length > 0 && filtered.every(c => selected.includes(c.id));
  const toggleAll = () => setSelected(allSelected ? [] : filtered.map(c => c.id));

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#F8FAFC] fade-in">
      {/* Toolbar */}
      <div className="bg-white border-b border-[#E2E8F0] px-6 py-3 flex items-center gap-3 shrink-0">
        <div className="w-72">
          <SearchInput placeholder="Search contacts..." value={search} onChange={setSearch} />
        </div>
        <select className="h-9 rounded-lg border border-[#E2E8F0] bg-white text-sm px-3 text-slate-600 focus:outline-none">
          <option>All Status</option>
          <option>Active</option>
          <option>Inactive</option>
        </select>
        <select className="h-9 rounded-lg border border-[#E2E8F0] bg-white text-sm px-3 text-slate-600 focus:outline-none">
          <option>All Campaigns</option>
          <option>Delhi Real Estate</option>
          <option>Mumbai Finance</option>
          <option>Hyderabad SaaS</option>
        </select>

        {selected.length > 0 && (
          <div className="flex items-center gap-2 ml-2 pl-2 border-l border-[#E2E8F0]">
            <span className="text-sm text-slate-600">{selected.length} selected</span>
            <Button variant="secondary" size="sm" onClick={() => { showToast(`Calling ${selected.length} contacts`, 'info'); }}>Bulk Call</Button>
            <Button variant="secondary" size="sm">Assign</Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected([])}>Clear</Button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
            Import
          </Button>
          <Button variant="outline" size="sm">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Export
          </Button>
          <Button variant="primary" size="sm">+ Add Contact</Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#F8FAFC] border-b border-[#E2E8F0] z-10">
            <tr>
              <th className="w-10 px-4 py-3">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded accent-[#4F46E5]" />
              </th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Contact</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Phone</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Company</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Score</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Campaign</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Owner</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Last Contact</th>
              <th className="w-28 px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-[#F1F5F9]">
            {filtered.map(contact => (
              <tr
                key={contact.id}
                className={`hover:bg-slate-50 transition-colors group ${selected.includes(contact.id) ? 'bg-[#F8FAFF]' : ''}`}
              >
                <td className="px-4 py-3.5">
                  <input type="checkbox" checked={selected.includes(contact.id)} onChange={() => toggleSelect(contact.id)} className="rounded accent-[#4F46E5]" />
                </td>
                <td className="px-3 py-3.5">
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => setDrawerContact(contact)}>
                    <Avatar initials={contact.name.split(' ').map(w => w[0]).join('')} size="sm" />
                    <div>
                      <p className="font-medium text-slate-900 hover:text-[#4F46E5] transition-colors">{contact.name}</p>
                      <p className="text-xs text-slate-400">{contact.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  <span className="font-mono text-xs text-slate-600">{contact.phone}</span>
                </td>
                <td className="px-3 py-3.5 text-slate-600">{contact.company}</td>
                <td className="px-3 py-3.5">
                  <Badge variant={statusVariant(contact.status)}>{contact.status}</Badge>
                </td>
                <td className="px-3 py-3.5">
                  <ScoreRing score={contact.leadScore} />
                </td>
                <td className="px-3 py-3.5">
                  <span className="text-xs text-slate-500">{contact.campaign || '—'}</span>
                </td>
                <td className="px-3 py-3.5">
                  <div className="flex items-center gap-1.5">
                    <Avatar initials={contact.owner.split(' ').map(w => w[0]).join('')} size="sm" />
                    <span className="text-xs text-slate-600">{contact.owner.split(' ')[0]}</span>
                  </div>
                </td>
                <td className="px-3 py-3.5 text-xs text-slate-500">{contact.lastContact || '—'}</td>
                <td className="px-3 py-3.5">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onCall ? onCall(contact.phone) : showToast(`Calling ${contact.name}...`, 'info')}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                      title="Call"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    </button>
                    <button
                      onClick={() => setDrawerContact(contact)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                      title="View"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="bg-white border-t border-[#E2E8F0] px-6 py-3 flex items-center justify-between shrink-0">
        <p className="text-sm text-slate-500">Showing {filtered.length} of {contacts.length} contacts</p>
        <div className="flex items-center gap-1">
          {['←', '1', '2', '3', '→'].map(p => (
            <button key={p} className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm transition-colors ${p === '1' ? 'bg-[#4F46E5] text-white' : 'text-slate-500 hover:bg-slate-100'}`}>{p}</button>
          ))}
        </div>
      </div>

      {/* Contact Drawer */}
      <Drawer open={!!drawerContact} onClose={() => setDrawerContact(null)} title="Contact Profile" width="max-w-md">
        {drawerContact && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <Avatar initials={drawerContact.name.split(' ').map(w => w[0]).join('')} size="lg" />
              <div>
                <h2 className="text-lg font-bold text-slate-900">{drawerContact.name}</h2>
                <p className="text-sm text-slate-500">{drawerContact.company}</p>
                <div className="flex gap-2 mt-1">
                  <Badge variant={statusVariant(drawerContact.status)}>{drawerContact.status}</Badge>
                  {drawerContact.tags.map(t => <Badge key={t} variant="default">{t}</Badge>)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-400 mb-0.5">Phone</p>
                <p className="text-sm font-mono font-medium text-slate-800">{drawerContact.phone}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-400 mb-0.5">Email</p>
                <p className="text-sm font-medium text-slate-800 truncate">{drawerContact.email}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-400 mb-0.5">Lead Score</p>
                <ScoreRing score={drawerContact.leadScore} />
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-400 mb-0.5">Owner</p>
                <p className="text-sm font-medium text-slate-800">{drawerContact.owner}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Campaign</p>
              <p className="text-sm text-slate-700">{drawerContact.campaign || 'Not assigned'}</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Timeline</p>
              <div className="space-y-2">
                {['Call connected 5:23', 'Added note', 'Status changed to Active', 'Lead created'].map((ev, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#4F46E5] shrink-0" />
                    <p className="text-xs text-slate-600">{ev}</p>
                    <p className="text-xs text-slate-400 ml-auto">{['Yesterday', '2 days ago', '1 week ago', '2 weeks ago'][i]}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="primary" size="md" className="flex-1" onClick={() => { if (onCall) onCall(drawerContact.phone); else showToast(`Calling ${drawerContact.name}...`, 'info'); setDrawerContact(null); }}>
                📞 Call Now
              </Button>
              <Button variant="outline" size="md" className="flex-1">Schedule Follow-up</Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Import Modal */}
      <Modal open={showImport} onClose={() => setShowImport(false)} title="Import Contacts" size="md">
        <div className="space-y-4">
          <div className="border-2 border-dashed border-[#E2E8F0] rounded-xl p-8 text-center hover:border-[#4F46E5]/40 transition-colors cursor-pointer">
            <div className="text-3xl mb-2">📤</div>
            <p className="text-sm font-medium text-slate-700">Drop your CSV file here</p>
            <p className="text-xs text-slate-400 mt-1">or click to browse</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-slate-600">Column mapping</p>
            {['Name', 'Phone', 'Email', 'Company'].map(col => (
              <div key={col} className="flex items-center gap-3">
                <span className="text-xs text-slate-500 w-16">{col}</span>
                <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                <select className="text-xs border border-[#E2E8F0] rounded-lg px-2 py-1.5 focus:outline-none">
                  <option>{col.toLowerCase()}</option>
                  <option>Select column...</option>
                </select>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="md" className="flex-1" onClick={() => setShowImport(false)}>Cancel</Button>
            <Button variant="primary" size="md" className="flex-1" onClick={() => { setShowImport(false); showToast('Import started — 245 contacts queued', 'success'); }}>Import</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
