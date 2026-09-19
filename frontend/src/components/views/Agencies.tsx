import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { Organization } from '../../api/types';
import { Badge, Button, Card, Input, Modal, StatCard } from '../ui/index';

export default function Agencies({ showToast }: { showToast: (msg: string, type?: 'success' | 'info' | 'error') => void }) {
  const [rows, setRows] = useState<Organization[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', max_managers: '10', max_admins: '30', max_users: '300' });

  const load = () => api<Organization[]>('/api/agencies/').then(setRows).catch((err) => showToast(err.message, 'error'));
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      await api('/api/agencies/', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          max_managers: Number(form.max_managers),
          max_admins: Number(form.max_admins),
          max_users: Number(form.max_users),
        }),
      });
      setOpen(false);
      setForm({ name: '', email: '', max_managers: '10', max_admins: '30', max_users: '300' });
      showToast('Agency created', 'success');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Create failed', 'error');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#F8FAFC] fade-in">
      <div className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Agencies</h2>
            <p className="text-sm text-slate-500">Tenant limits are enforced on the server.</p>
          </div>
          <Button variant="primary" onClick={() => setOpen(true)}>+ New Agency</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard label="Agencies" value={rows.length} />
          <StatCard label="Active" value={rows.filter((r) => r.is_active !== false).length} color="text-green-600" />
          <StatCard label="Suspended" value={rows.filter((r) => r.subscription_status === 'suspended').length} color="text-amber-600" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rows.map((org) => (
            <Card key={org.id} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-slate-900">{org.name}</h3>
                  <p className="text-xs text-slate-400">{org.timezone || 'Asia/Kolkata'}</p>
                </div>
                <Badge variant={org.is_active === false ? 'danger' : 'success'}>{org.subscription_status || 'active'}</Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-sm font-bold text-slate-900">{org.managers ?? org.managers_used ?? 0}/{org.max_managers ?? 0}</p>
                  <p className="text-[10px] text-slate-400">Managers</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-sm font-bold text-slate-900">{org.admins ?? org.admins_used ?? 0}/{org.max_admins ?? 0}</p>
                  <p className="text-[10px] text-slate-400">Admins</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="text-sm font-bold text-slate-900">{org.users ?? org.users_used ?? 0}/{org.max_users ?? 0}</p>
                  <p className="text-[10px] text-slate-400">Users</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Create agency">
        <div className="space-y-3">
          <Input label="Agency name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Agency login email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <div className="grid grid-cols-3 gap-3">
            <Input label="Manager limit" value={form.max_managers} onChange={(e) => setForm({ ...form, max_managers: e.target.value })} />
            <Input label="Admin limit" value={form.max_admins} onChange={(e) => setForm({ ...form, max_admins: e.target.value })} />
            <Input label="User limit" value={form.max_users} onChange={(e) => setForm({ ...form, max_users: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={create}>Create</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
