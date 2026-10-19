import React, { useEffect, useMemo, useState } from 'react';
import { Avatar, Badge, Button, SearchInput, Input, Modal, Select } from '../ui/index';
import { api } from '../../api/client';
import type { Campaign, Organization, User } from '../../api/types';
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
  campaigns: string[];
  gsm_port: string;
  max_managers: string;
  max_admins: string;
  max_users: string;
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
  campaigns: [],
  gsm_port: '',
  max_managers: '10',
  max_admins: '30',
  max_users: '300',
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
  const actorOrg = actor?.organization?.id;
  const personOrg = person.organization?.id;
  if (!actorOrg || !personOrg || Number(actorOrg) !== Number(personOrg)) return false;
  const role = person.role_normalized || person.role;
  if (role === 'super_admin') return can(actor, 'create_agency');
  if (role === 'agency') return can(actor, 'manage_agency');
  if (role === 'manager' || role === 'supervisor') return can(actor, 'manage_manager');
  if (role === 'admin') return can(actor, 'manage_admin');
  return can(actor, 'manage_user');
}

function campaignMatchesOrg(camp: Campaign, orgId: string) {
  if (!orgId) return true;
  return camp.agency != null && Number(camp.agency) === Number(orgId);
}

function canAddStaff(actor: User | null) {
  if (isSuperActor(actor)) return true;
  return can(actor, 'create_user') || can(actor, 'create_admin') || can(actor, 'create_manager') || can(actor, 'create_agency');
}

export default function Team({ showToast }: { showToast: (msg: string, type?: 'success' | 'info' | 'error') => void }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<User[]>([]);
  const [agencies, setAgencies] = useState<Organization[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [confirm, setConfirm] = useState<{ person: User; action: 'delete' | 'deactivate' } | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<StaffForm>(emptyForm);
    const [ports, setPorts] = useState<{ id: number; name: string; assigned_user: number | null; caller_id: string; sip_account?: string }[]>([]);

  const isSuper = isSuperActor(user);

  const load = () => {
    api<User[]>('/api/staff/').then(setRows).catch((err) => showToast(err.message, 'error'));
    if (isSuperActor(user) || can(user, 'manage_agency')) {
      api<Organization[]>('/api/agencies/').then(setAgencies).catch(() => undefined);
    }
    api<Campaign[]>('/api/campaigns/').then(setCampaigns).catch(() => undefined);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!open || (form.role !== 'user' && form.role !== 'agent')) return;
    const query = form.organization ? `?agency=${form.organization}` : '';
    api<{ id: number; name: string; assigned_user: number | null; caller_id: string; sip_account?: string }[]>(`/api/telephony/ports/${query}`)
      .then(setPorts)
      .catch(() => setPorts([]));
  }, [open, form.role, form.organization]);

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
      campaigns: [],
      gsm_port: '',
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
      campaigns: (person.campaign_ids || []).map(String),
      gsm_port: person.gsm_port ? String(person.gsm_port) : '',
      max_managers: String(person.organization?.max_managers ?? 10),
      max_admins: String(person.organization?.max_admins ?? 30),
      max_users: String(person.organization?.max_users ?? 300),
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.email.trim()) {
      showToast('Email is required', 'error');
      return;
    }
    if ((form.role === 'user' || form.role === 'agent') && form.campaigns.length === 0) {
      showToast('Assign the user to a campaign before they can call', 'error');
      return;
    }
    const freePorts = ports.filter((port) => !port.assigned_user || port.assigned_user === editing?.id);
    if ((form.role === 'user' || form.role === 'agent') && freePorts.length > 0 && !form.gsm_port) {
      showToast('Assign a GSM channel from this agency', 'error');
      return;
    }
    if (form.role === 'agency' && isSuperActor(user)) {
      const limits = [form.max_managers, form.max_admins, form.max_users];
      if (limits.some((value) => value.trim() === '' || Number.isNaN(Number(value)) || Number(value) < 0)) {
        showToast('Set how many managers, admins, and users this agency can create', 'error');
        return;
      }
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        email: form.email.trim(),
        first_name: form.first_name,
        last_name: form.last_name,
        role: form.role,
        team: form.team,
        organization: form.role === 'agency' && !editing ? undefined : (form.organization ? Number(form.organization) : undefined),
        reports_to: form.reports_to ? Number(form.reports_to) : null,
        campaigns: form.campaigns.map(Number),
      };
      if ((form.role === 'user' || form.role === 'agent') && ports.length > 0) {
        payload.gsm_port = form.gsm_port ? Number(form.gsm_port) : null;
      }
      if (form.password) payload.password = form.password;
      if (form.role === 'agency' && isSuperActor(user)) {
        payload.max_managers = Number(form.max_managers);
        payload.max_admins = Number(form.max_admins);
        payload.max_users = Number(form.max_users);
      }
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
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">PC</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Extension</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Role</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Agency</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Reports to</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Team</th>
              <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Campaigns</th>
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
                <td className="px-3 py-3.5 font-mono text-slate-700">{person.pc_number || '—'}</td>
                <td className="px-3 py-3.5 font-mono text-slate-700">{person.extension || '—'}</td>
                <td className="px-3 py-3.5"><Badge>{roleLabel(person.role_normalized || person.role)}</Badge></td>
                <td className="px-3 py-3.5 text-slate-600">{person.organization?.name || '—'}</td>
                <td className="px-3 py-3.5 text-slate-600">{person.reports_to_name || '—'}</td>
                <td className="px-3 py-3.5 text-slate-600">{person.team || '—'}</td>
                <td className="px-3 py-3.5 text-slate-600">{(person.campaign_names || []).join(', ') || '—'}</td>
                <td className="px-3 py-3.5">
                  <Badge variant={person.is_active === false ? 'danger' : 'success'}>
                    {person.is_active === false ? 'Inactive' : 'Active'}
                  </Badge>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-400">No accounts match this filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit account' : 'Add account'} size="lg">
        <div className="space-y-3">
          {editing ? (
            <div className="grid grid-cols-2 gap-3">
              <Input label="PC number" value={String(editing.pc_number || '')} readOnly />
              <Input label="Extension" value={editing.extension || ''} readOnly />
            </div>
          ) : (
            <p className="text-xs text-slate-500">A PC number and an extension are assigned when this account is saved. They stay with the account.</p>
          )}
          <Input label="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="First name" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
            <Input label="Last name" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} options={roleOptions(user)} />
            <Input label="Team" value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} placeholder="Sales Alpha" />
          </div>
          {form.role === 'agency' && isSuperActor(user) && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">
                {editing
                  ? 'These limits are how many managers, admins, and users this agency can create.'
                  : 'This account gets its own company. Set how many managers, admins, and users it can create.'}
              </p>
              <div className="grid grid-cols-3 gap-3">
                <Input label="Max managers" value={form.max_managers} onChange={(e) => setForm({ ...form, max_managers: e.target.value })} />
                <Input label="Max admins" value={form.max_admins} onChange={(e) => setForm({ ...form, max_admins: e.target.value })} />
                <Input label="Max users" value={form.max_users} onChange={(e) => setForm({ ...form, max_users: e.target.value })} />
              </div>
            </div>
          )}
          {isSuper && agencies.length > 0 && form.role !== 'agency' && (
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
          {(form.role === 'user' || form.role === 'agent') && ports.some((port) => !port.assigned_user || port.assigned_user === editing?.id) && (
            <Select
              label="GSM channel"
              value={form.gsm_port}
              onChange={(e) => setForm({ ...form, gsm_port: e.target.value })}
              options={[
                { value: '', label: 'Select channel' },
                ...ports
                  .filter((port) => !port.assigned_user || port.assigned_user === editing?.id)
                  .map((port) => ({ value: String(port.id), label: `${port.name}${port.sip_account ? ` ${port.sip_account}` : ''}${port.caller_id ? ` · ${port.caller_id}` : ''}` })),
              ]}
            />
          )}
          {(form.role === 'user' || form.role === 'agent') && (
            <div>
              <p className="block text-sm font-medium text-slate-700 mb-1.5">Campaigns <span className="text-red-500">*</span></p>
              <p className="text-xs text-slate-400 mb-2">Required. The user can only use manual or auto calling on assigned campaigns.</p>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-[#E2E8F0] p-2 space-y-1.5">
                {campaigns
                  .filter((camp) => campaignMatchesOrg(camp, form.organization))
                  .map((camp) => {
                    const checked = form.campaigns.includes(String(camp.id));
                    return (
                      <label key={camp.id} className="flex items-center gap-2 text-sm text-slate-700 px-1 py-0.5">
                        <input
                          type="checkbox"
                          className="accent-[#4F46E5]"
                          checked={checked}
                          onChange={() => {
                            const value = String(camp.id);
                            setForm({
                              ...form,
                              campaigns: checked ? form.campaigns.filter((id) => id !== value) : [...form.campaigns, value],
                            });
                          }}
                        />
                        <span>{camp.name}</span>
                        {camp.agency_name && <span className="text-xs text-slate-400">({camp.agency_name})</span>}
                      </label>
                    );
                  })}
                {campaigns.filter((camp) => campaignMatchesOrg(camp, form.organization)).length === 0 && (
                  <p className="text-xs text-slate-400 px-1 py-2">No campaigns in this agency. Create a campaign first.</p>
                )}
              </div>
            </div>
          )}
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
