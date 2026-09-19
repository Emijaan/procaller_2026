import React, { useEffect, useState } from 'react';
import { Avatar, Badge, Button, SearchInput, Input, Modal, Select } from '../ui/index';
import { api } from '../../api/client';
import type { User } from '../../api/types';
import { roleLabel } from '../../api/access';

export default function Team({ showToast }: { showToast: (msg: string, type?: 'success' | 'info' | 'error') => void }) {
  const [rows, setRows] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: '', first_name: '', last_name: '', role: 'user', password: 'ProCaller@2026' });

  const load = () => api<User[]>('/api/staff/').then(setRows).catch((err) => showToast(err.message, 'error'));
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((u) =>
    `${u.display_name} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  );

  const create = async () => {
    try {
      await api('/api/staff/', { method: 'POST', body: JSON.stringify(form) });
      setOpen(false);
      showToast('Account created', 'success');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Create failed', 'error');
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#F8FAFC] fade-in">
      <div className="bg-white border-b border-[#E2E8F0] px-6 py-3 flex items-center gap-3 shrink-0">
        <div className="w-64">
          <SearchInput placeholder="Search team..." value={search} onChange={setSearch} />
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="primary" size="sm" onClick={() => setOpen(true)}>+ Add account</Button>
        </div>
      </div>
      <div className="bg-white border-b border-[#E2E8F0] px-6 py-3 flex items-center gap-6 shrink-0">
        {[
          { label: 'Total', value: rows.length },
          { label: 'Managers', value: rows.filter((u) => (u.role_normalized || u.role) === 'manager').length },
          { label: 'Admins', value: rows.filter((u) => (u.role_normalized || u.role) === 'admin').length },
          { label: 'Users', value: rows.filter((u) => ['user', 'agent'].includes(u.role_normalized || u.role)).length },
        ].map((stat) => (
          <div key={stat.label}>
            <span className="text-lg font-bold text-slate-900">{stat.value}</span>
            <span className="text-xs text-slate-400 ml-1.5">{stat.label}</span>
          </div>
        ))}
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#F8FAFC] border-b border-[#E2E8F0] z-10">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Person</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Role</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Reports to</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Team</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-[#F1F5F9]">
            {filtered.map((person) => (
              <tr key={person.id} className="hover:bg-slate-50">
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar initials={person.avatar_initials || 'PC'} size="md" />
                    <div>
                      <p className="font-medium text-slate-900">{person.display_name}</p>
                      <p className="text-xs text-slate-400">{person.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3.5"><Badge>{roleLabel(person.role_normalized || person.role)}</Badge></td>
                <td className="px-3 py-3.5 text-slate-600">{person.reports_to_name || '—'}</td>
                <td className="px-3 py-3.5 text-slate-600">{person.team || '—'}</td>
                <td className="px-3 py-3.5"><Badge variant={person.is_active === false ? 'danger' : 'success'}>{person.is_active === false ? 'Inactive' : 'Active'}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Add account">
        <div className="space-y-3">
          <Input label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="First name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            <Input label="Last name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          </div>
          <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} options={[
            { value: 'manager', label: 'Manager' },
            { value: 'admin', label: 'Admin' },
            { value: 'user', label: 'User' },
          ]} />
          <Input label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={create}>Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
