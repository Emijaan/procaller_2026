import React, { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { Organization } from '../../api/types';
import { can } from '../../api/access';
import { useAuth } from '../../context/AuthContext';
import { Badge, Button, Card, Input, Modal, Select, StatCard } from '../ui/index';

type AgencyForm = {
  name: string;
  email: string;
  password: string;
  max_managers: string;
  max_admins: string;
  max_users: string;
  subscription_status: string;
  is_active: boolean;
  ibr_enabled: boolean;
  port_group: string;
};

const emptyForm: AgencyForm = {
  name: '',
  email: '',
  password: 'ProCaller@2026',
  max_managers: '10',
  max_admins: '30',
  max_users: '300',
  subscription_status: 'active',
  is_active: true,
  ibr_enabled: false,
  port_group: '',
};

export default function Agencies({ showToast }: { showToast: (msg: string, type?: 'success' | 'info' | 'error') => void }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<Organization[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);
  const [confirm, setConfirm] = useState<Organization | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<AgencyForm>(emptyForm);
  const [groups, setGroups] = useState<{ id: number; name: string; agency: number | null; gateway: number }[]>([]);
  const [gateways, setGateways] = useState<{ id: number; name: string }[]>([]);
  const [channel, setChannel] = useState({ name: '', dial_prefix: '', caller_id: '' });
  const isSuper = user?.is_superuser || (user?.role_normalized || user?.role) === 'super_admin';

  const load = () => api<Organization[]>('/api/agencies/').then(setRows).catch((err) => showToast(err.message, 'error'));
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (org: Organization) => {
    setEditing(org);
    if (isSuper) {
      api<{ id: number; name: string; agency: number | null; gateway: number }[]>('/api/telephony/port-groups/').then((rows) => {
        setGroups(rows);
        const own = rows.find((row) => row.agency === org.id);
        setForm((prev) => ({ ...prev, port_group: own ? String(own.id) : '' }));
      }).catch(() => setGroups([]));
      api<{ id: number; name: string }[]>('/api/telephony/gateways/').then(setGateways).catch(() => setGateways([]));
    }
    setForm({
      name: org.name,
      email: '',
      password: '',
      max_managers: String(org.max_managers ?? 10),
      max_admins: String(org.max_admins ?? 30),
      max_users: String(org.max_users ?? 300),
      subscription_status: org.subscription_status || 'active',
      is_active: org.is_active !== false,
      ibr_enabled: Boolean(org.ibr_enabled),
      port_group: '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      showToast('Agency name is required', 'error');
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await api(`/api/agencies/${editing.id}/`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: form.name,
            max_managers: Number(form.max_managers),
            max_admins: Number(form.max_admins),
            max_users: Number(form.max_users),
            subscription_status: form.subscription_status,
            is_active: form.is_active,
            ...(isSuper ? { ibr_enabled: form.ibr_enabled, port_group: form.port_group ? Number(form.port_group) : null } : {}),
          }),
        });
        showToast('Agency updated', 'success');
      } else {
        await api('/api/agencies/', {
          method: 'POST',
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            password: form.password || 'ProCaller@2026',
            max_managers: Number(form.max_managers),
            max_admins: Number(form.max_admins),
            max_users: Number(form.max_users),
            subscription_status: form.subscription_status,
          }),
        });
        showToast('Agency created', 'success');
      }
      setOpen(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (org: Organization) => {
    const next = org.is_active === false;
    try {
      await api(`/api/agencies/${org.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          is_active: next,
          subscription_status: next ? 'active' : 'suspended',
        }),
      });
      showToast(next ? 'Agency activated' : 'Agency deactivated', 'success');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  const remove = async (org: Organization) => {
    try {
      const result = await api<{ deactivated?: boolean; detail?: string }>(`/api/agencies/${org.id}/`, { method: 'DELETE' });
      showToast(result?.deactivated ? (result.detail || 'Agency deactivated') : 'Agency deleted', 'success');
      setConfirm(null);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#F8FAFC] fade-in">
      <div className="max-w-[1200px] mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Agencies</h2>
            <p className="text-sm text-slate-500">Create, edit, deactivate, or remove tenants. Limits are enforced on the server.</p>
          </div>
          {(can(user, 'create_agency') || user?.is_superuser || (user?.role_normalized || user?.role) === 'super_admin') && (
            <Button variant="primary" onClick={openCreate}>+ New Agency</Button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard label="Agencies" value={rows.length} />
          <StatCard label="Active" value={rows.filter((r) => r.is_active !== false).length} color="text-green-600" />
          <StatCard label="Suspended" value={rows.filter((r) => r.subscription_status === 'suspended' || r.is_active === false).length} color="text-amber-600" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {rows.map((org) => (
            <Card key={org.id} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-slate-900">{org.name}</h3>
                  <p className="text-xs text-slate-400">{org.timezone || 'Asia/Kolkata'}</p>
                </div>
                <Badge variant={org.is_active === false ? 'danger' : 'success'}>{org.is_active === false ? 'inactive' : (org.subscription_status || 'active')}</Badge>
                {org.ibr_enabled && <Badge variant="info">IBR</Badge>}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center mb-4">
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
              {(can(user, 'manage_agency') || user?.is_superuser || (user?.role_normalized || user?.role) === 'super_admin') && (
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={() => openEdit(org)}>Edit</Button>
                  <Button variant="outline" size="sm" onClick={() => toggleActive(org)}>
                    {org.is_active === false ? 'Activate' : 'Deactivate'}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setConfirm(org)}>Delete</Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit agency' : 'Create agency'}>
        <div className="space-y-3">
          <Input label="Agency name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          {!editing && (
            <>
              <Input label="Agency login email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Input label="Manager limit" value={form.max_managers} onChange={(e) => setForm({ ...form, max_managers: e.target.value })} />
            <Input label="Admin limit" value={form.max_admins} onChange={(e) => setForm({ ...form, max_admins: e.target.value })} />
            <Input label="User limit" value={form.max_users} onChange={(e) => setForm({ ...form, max_users: e.target.value })} />
          </div>
          {editing && isSuper && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.ibr_enabled} onChange={(e) => setForm({ ...form, ibr_enabled: e.target.checked })} />
              Enable IBR broadcast
            </label>
          )}
          {editing && isSuper && (
            <div className="space-y-2">
              <Select
                label="GSM port group"
                value={form.port_group}
                onChange={(e) => setForm({ ...form, port_group: e.target.value })}
                options={[{ value: '', label: 'None' }, ...groups.map((row) => ({ value: String(row.id), label: row.name }))]}
              />
              <div className="grid grid-cols-3 gap-2">
                <Input label="Channel" value={channel.name} onChange={(e) => setChannel({ ...channel, name: e.target.value })} />
                <Input label="Dial prefix" value={channel.dial_prefix} onChange={(e) => setChannel({ ...channel, dial_prefix: e.target.value })} />
                <Input label="SIM caller ID" value={channel.caller_id} onChange={(e) => setChannel({ ...channel, caller_id: e.target.value })} />
              </div>
              <Button variant="outline" type="button" onClick={async () => {
                if (!channel.name.trim()) {
                  showToast('Channel name is required', 'error');
                  return;
                }
                try {
                  let groupId = form.port_group ? Number(form.port_group) : 0;
                  if (!groupId) {
                    const gateway = gateways[0];
                    if (!gateway) {
                      showToast('No GSM gateway is configured', 'error');
                      return;
                    }
                    const created = await api<{ id: number; name: string }>('/api/telephony/port-groups/', {
                      method: 'POST',
                      body: JSON.stringify({ gateway: gateway.id, name: `${form.name || 'Agency'} ports` }),
                    });
                    groupId = created.id;
                    setGroups((prev) => [...prev, { id: created.id, name: created.name, agency: editing?.id || null, gateway: gateway.id }]);
                    setForm({ ...form, port_group: String(created.id) });
                  }
                  await api('/api/telephony/ports/', {
                    method: 'POST',
                    body: JSON.stringify({ group: groupId, name: channel.name, dial_prefix: channel.dial_prefix, caller_id: channel.caller_id }),
                  });
                  setChannel({ name: '', dial_prefix: '', caller_id: '' });
                  showToast('GSM channel added. Save the agency to keep this group.', 'success');
                } catch (err) {
                  showToast(err instanceof Error ? err.message : 'Could not add the channel', 'error');
                }
              }}>Add channel</Button>
            </div>
          )}
          {editing && (
            <Select
              label="Status"
              value={form.is_active ? form.subscription_status : 'suspended'}
              onChange={(e) => setForm({
                ...form,
                subscription_status: e.target.value,
                is_active: e.target.value !== 'suspended' && e.target.value !== 'expired',
              })}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'trial', label: 'Trial' },
                { value: 'suspended', label: 'Suspended' },
                { value: 'expired', label: 'Expired' },
              ]}
            />
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={save}>{editing ? 'Save changes' : 'Create'}</Button>
          </div>
        </div>
      </Modal>
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Delete agency">
        <p className="text-sm text-slate-600 mb-4">
          Remove <span className="font-semibold text-slate-900">{confirm?.name}</span>? If it still has team or campaigns it will be deactivated instead.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => confirm && remove(confirm)}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
