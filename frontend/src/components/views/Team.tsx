import React, { useEffect, useMemo, useState } from 'react';
import { Avatar, Badge, Button, SearchInput, Input, Modal, Select } from '../ui/index';
import { api } from '../../api/client';
import type { Organization, User } from '../../api/types';
import { can, roleLabel } from '../../api/access';
import { useAuth } from '../../context/AuthContext';

type StaffForm = {
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  password: string;
  team: string;
  organization: string;
  reports_to: string;
};

const emptyForm: StaffForm = {
  email: '',
  first_name: '',
  last_name: '',
  role: 'user',
  password: 'ProCaller@2026',
  team: '',
  organization: '',
  reports_to: '',
};

function roleOptions(actor: User | null) {
  const options: { value: string; label: string }[] = [];
  if (can(actor, 'create_agency')) options.push({ value: 'agency', label: 'Agency' });
  if (can(actor, 'create_manager')) options.push({ value: 'manager', label: 'Manager' });
  if (can(actor, 'create_admin')) options.push({ value: 'admin', label: 'Admin' });
  if (can(actor, 'create_user')) options.push({ value: 'user', label: 'User' });
  return options;
}

function isSuperActor(actor: User | null) {
  if (!actor) return false;
  return actor.is_superuser === true || (actor.role_normalized || actor.role) === 'super_admin';
}

function canManagePerson(actor: User | null, person: User) {
  if (isSuperActor(actor)) return true;
  const role = person.role_normalized || person.role;
  if (role === 'super_admin') return can(actor, 'create_agency');
  if (role === 'agency') return can(actor, 'manage_agency');
  if (role === 'manager' || role === 'supervisor') return can(actor, 'manage_manager');
  if (role === 'admin') return can(actor, 'manage_admin');
  return can(actor, 'manage_user');
}

function canAddStaff(actor: User | null) {
  if (isSuperActor(actor)) return true;
  return can(actor, 'create_user') || can(actor, 'create_admin') || can(actor, 'create_manager') || can(actor, 'create_agency');
}

export default function Team({ showToast }: { showToast: (msg: string, type?: 'success' | 'info' | 'error') => void }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<User[]>([]);
  const [agencies, setAgencies] = useState<Organization[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [confirm, setConfirm] = useState<{ person: User; action: 'delete' | 'deactivate' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<StaffForm>(emptyForm);

  const isSuper = isSuperActor(user);

  const load = () => {
    api<User[]>('/api/staff/').then(setRows).catch((err) => showToast(err.message, 'error'));
    if (isSuperActor(user) || can(user, 'manage_agency')) {
      api<Organization[]>('/api/agencies/').then(setAgencies).catch(() => undefined);
    }
  };
  useEffect(() => { load(); }, []);

  const managers = useMemo(
    () => rows.filter((row) => ['agency', 'manager', 'admin', 'super_admin'].includes(row.role_normalized || row.role)),
    [rows],
  );

  const filtered = rows.filter((person) => {
    const hay = `${person.display_name} ${person.email} ${person.team} ${person.role}`.toLowerCase();
    if (search && !hay.includes(search.toLowerCase())) return false;
    const role = person.role_normalized || person.role;
    if (roleFilter === 'inactive') return person.is_active === false;
    if (roleFilter === 'manager') return role === 'manager' || role === 'supervisor';
    if (roleFilter === 'user') return role === 'user' || role === 'agent';
    if (roleFilter !== 'all') return role === roleFilter;
    return true;
  });

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      role: roleOptions(user)[0]?.value || 'user',
      organization: user?.organization?.id ? String(user.organization.id) : '',
    });
    setOpen(true);
  };

  const openEdit = (person: User) => {
    setEditing(person);
    setForm({
      email: person.email,
      first_name: person.first_name || '',
      last_name: person.last_name || '',
      role: person.role_normalized || person.role,
      password: '',
      team: person.team || '',
      organization: person.organization?.id ? String(person.organization.id) : '',
      reports_to: person.reports_to ? String(person.reports_to) : '',
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.email.trim()) {
      showToast('Email is required', 'error');
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        email: form.email.trim(),
        first_name: form.first_name,
        last_name: form.last_name,
        role: form.role,
        team: form.team,
        organization: form.organization ? Number(form.organization) : undefined,
        reports_to: form.reports_to ? Number(form.reports_to) : null,
      };
      if (form.password) payload.password = form.password;
      if (editing) {
        await api(`/api/staff/${editing.id}/`, { method: 'PATCH', body: JSON.stringify(payload) });
        showToast('Account updated', 'success');
      } else {
        await api('/api/staff/', { method: 'POST', body: JSON.stringify(payload) });
        showToast('Account created', 'success');
      }
      setOpen(false);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (person: User) => {
    try {
      await api(`/api/staff/${person.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: person.is_active === false }),
      });
      showToast(person.is_active === false ? 'Account activated' : 'Account deactivated', 'success');
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error');
    }
  };

  const remove = async (person: User) => {
    try {
      await api(`/api/staff/${person.id}/`, { method: 'DELETE' });
      showToast('Account removed', 'success');
      setConfirm(null);
      load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-[#F8FAFC] fade-in">
      <div className="bg-white border-b border-[#E2E8F0] px-6 py-3 flex items-center gap-3 shrink-0">
        <div className="w-64">
          <SearchInput placeholder="Search team..." value={search} onChange={setSearch} />
        </div>
        <Select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          options={[
            { value: 'all', label: 'All roles' },
            { value: 'agency', label: 'Agency' },
            { value: 'manager', label: 'Managers' },
            { value: 'admin', label: 'Admins' },
            { value: 'user', label: 'Users' },
            { value: 'inactive', label: 'Inactive' },
          ]}
          className="w-40"
        />
        <div className="ml-auto flex gap-2">
          {canAddStaff(user) && (
            <Button variant="primary" size="sm" onClick={openCreate}>+ Add account</Button>
          )}
        </div>
      </div>
      <div className="bg-white border-b border-[#E2E8F0] px-6 py-3 flex items-center gap-6 shrink-0">
        {[
          { label: 'Total', value: rows.length },
          { label: 'Managers', value: rows.filter((u) => ['manager', 'supervisor'].includes(u.role_normalized || u.role)).length },
          { label: 'Admins', value: rows.filter((u) => (u.role_normalized || u.role) === 'admin').length },
          { label: 'Users', value: rows.filter((u) => ['user', 'agent'].includes(u.role_normalized || u.role)).length },
          { label: 'Inactive', value: rows.filter((u) => u.is_active === false).length },
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
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase whitespace-nowrap">Actions</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Role</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Agency</th>
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
                <td className="px-3 py-3.5 whitespace-nowrap">
                  {canManagePerson(user, person) ? (
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(person)}>Edit</Button>
                      {Number(person.id) !== Number(user?.id) && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => toggleActive(person)}>
                            {person.is_active === false ? 'Activate' : 'Deactivate'}
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => setConfirm({ person, action: 'delete' })}>Delete</Button>
                        </>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-3 py-3.5"><Badge>{roleLabel(person.role_normalized || person.role)}</Badge></td>
                <td className="px-3 py-3.5 text-slate-600">{person.organization?.name || '—'}</td>
                <td className="px-3 py-3.5 text-slate-600">{person.reports_to_name || '—'}</td>
                <td className="px-3 py-3.5 text-slate-600">{person.team || '—'}</td>
                <td className="px-3 py-3.5">
                  <Badge variant={person.is_active === false ? 'danger' : 'success'}>
                    {person.is_active === false ? 'Inactive' : 'Active'}
                  </Badge>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-400">No accounts match this filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit account' : 'Add account'} size="lg">
        <div className="space-y-3">
          <Input label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="First name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            <Input label="Last name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} options={roleOptions(user)} />
            <Input label="Team" value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} placeholder="Sales Alpha" />
          </div>
          {isSuper && agencies.length > 0 && (
            <Select
              label="Agency"
              value={form.organization}
              onChange={(e) => setForm({ ...form, organization: e.target.value })}
              options={[{ value: '', label: 'Select agency' }, ...agencies.map((org) => ({ value: String(org.id), label: org.name }))]}
            />
          )}
          <Select
            label="Reports to"
            value={form.reports_to}
            onChange={(e) => setForm({ ...form, reports_to: e.target.value })}
            options={[
              { value: '', label: 'None' },
              ...managers.filter((row) => row.id !== editing?.id).map((row) => ({
                value: String(row.id),
                label: `${row.display_name} (${roleLabel(row.role_normalized || row.role)})`,
              })),
            ]}
          />
          <Input
            label={editing ? 'New password (optional)' : 'Password'}
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" loading={busy} onClick={save}>{editing ? 'Save changes' : 'Create'}</Button>
          </div>
        </div>
      </Modal>
      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Delete account">
        <p className="text-sm text-slate-600 mb-4">
          Remove <span className="font-semibold text-slate-900">{confirm?.person.display_name}</span> ({confirm?.person.email})?
          If they have call history they will be deactivated instead.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => confirm && remove(confirm.person)}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
