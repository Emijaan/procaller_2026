import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button } from '../ui/index';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

type AgentRow = {
  user_id: number;
  agent: string;
  mode: string;
  online: number;
  manual: number;
  preview: number;
  break: number;
  total_calls: number;
  answered: number;
  unanswered: number;
  busy: number;
  no_answer: number;
  failed: number;
  talk_seconds: number;
  hold_seconds: number;
};

type Option = { id: number; name: string; email?: string; code?: string; campaign_type?: string; campaign_id?: number; campaign_name?: string };
type Filters = {
  agencies: Option[];
  managers: Option[];
  admins: Option[];
  users: Option[];
  campaigns: Option[];
  files: Option[];
  roles: string[];
  dispositions: string[];
  statuses: string[];
};
type CallRow = {
  id: number;
  phone: string;
  campaign: string;
  import_file: string;
  agent: string;
  disposition: string;
  announcement: string;
  started_at: string;
};

const emptyFilters: Filters = {
  agencies: [], managers: [], admins: [], users: [], campaigns: [], files: [], roles: [], dispositions: [], statuses: [],
};

function hms(v = 0) {
  const s = Math.max(0, Number(v) || 0);
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function personLabel(row: Option) {
  return row.email ? `${row.name} · ${row.email}` : row.name;
}

export default function Reports() {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [agency, setAgency] = useState('');
  const [manager, setManager] = useState('');
  const [admin, setAdmin] = useState('');
  const [agent, setAgent] = useState('');
  const [role, setRole] = useState('');
  const [campaign, setCampaign] = useState('');
  const [fileId, setFileId] = useState('');
  const [status, setStatus] = useState('');
  const [phone, setPhone] = useState('');
  const [dispositions, setDispositions] = useState<string[]>([]);
  const [options, setOptions] = useState<Filters>(emptyFilters);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [callTotal, setCallTotal] = useState(0);
  const [totals, setTotals] = useState({ calls: 0, answered: 0, unanswered: 0, talk_seconds: 0, hold_seconds: 0 });
  const [error, setError] = useState('');

  const files = useMemo(
    () => options.files.filter((row) => !campaign || String(row.campaign_id) === campaign),
    [options.files, campaign],
  );
  const showIvr = user?.role !== 'user' && user?.role !== 'agent';

  const qs = useMemo(() => {
    const params = new URLSearchParams();
    if (from || to) {
      if (from) params.set('from', from);
      if (to) params.set('to', to);
    } else {
      params.set('dates', 'all');
    }
    if (agency) params.set('agency', agency);
    if (manager) params.set('manager', manager);
    if (admin) params.set('admin', admin);
    if (agent) params.set('user', agent);
    if (role) params.set('role', role);
    if (campaign) params.set('campaign', campaign);
    if (fileId) params.set('import_job', fileId);
    if (status) params.set('status', status);
    if (phone.trim()) params.set('phone', phone.trim());
    if (dispositions.length) params.set('disposition', dispositions.join(','));
    return params.toString();
  }, [from, to, agency, manager, admin, agent, role, campaign, fileId, status, phone, dispositions]);

  useEffect(() => {
    api<Filters>('/api/reports/filters/').then(setOptions).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    api<{ agents: AgentRow[]; totals: typeof totals }>(`/api/reports/daily/?${qs}`).then((data) => {
      setAgents(data.agents || []);
      setTotals(data.totals || totals);
    }).catch((err) => setError(err.message));
    api<{ campaigns: any[] }>(`/api/reports/campaigns/?${qs}`).then((data) => setCampaigns(data.campaigns || [])).catch((err) => setError(err.message));
    api<{ calls: CallRow[]; total: number }>(`/api/reports/calls/?limit=20&${qs}`).then((data) => {
      setCalls(data.calls || []);
      setCallTotal(data.total || 0);
    }).catch((err) => setError(err.message));
  }, [qs]);

  const download = (kind: string, format: string) => {
    const token = localStorage.getItem('procaller.access') || '';
    setError('');
    fetch(`/api/reports/export/?kind=${kind}&file=${format}&${qs}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail || 'Export failed');
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${kind}-report.${format}`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((err) => setError(err.message || 'Export failed'));
  };

  const toggleDisposition = (code: string) => {
    setDispositions((current) => (current.includes(code) ? current.filter((item) => item !== code) : [...current, code]));
  };

  const reset = () => {
    setFrom(today);
    setTo(today);
    setAgency('');
    setManager('');
    setAdmin('');
    setAgent('');
    setRole('');
    setCampaign('');
    setFileId('');
    setStatus('');
    setPhone('');
    setDispositions([]);
  };

  const field = 'h-9 w-full rounded-lg border border-[#E2E8F0] bg-white px-3 text-sm';

  return (
    <div className="flex-1 overflow-y-auto bg-[#F8FAFC] fade-in">
      <div className="max-w-[1200px] mx-auto px-6 py-6 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label className="text-xs text-slate-500">From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
          </label>
          <label className="text-xs text-slate-500">To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} />
          </label>
          {options.agencies.length > 0 && (
            <label className="text-xs text-slate-500">Agency
              <select value={agency} onChange={(e) => setAgency(e.target.value)} className={field}>
                <option value="">All agencies</option>
                {options.agencies.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </label>
          )}
          {options.managers.length > 0 && (
            <label className="text-xs text-slate-500">Manager
              <select value={manager} onChange={(e) => setManager(e.target.value)} className={field}>
                <option value="">All managers</option>
                {options.managers.map((row) => <option key={row.id} value={row.id}>{personLabel(row)}</option>)}
              </select>
            </label>
          )}
          {options.admins.length > 0 && (
            <label className="text-xs text-slate-500">Admin
              <select value={admin} onChange={(e) => setAdmin(e.target.value)} className={field}>
                <option value="">All admins</option>
                {options.admins.map((row) => <option key={row.id} value={row.id}>{personLabel(row)}</option>)}
              </select>
            </label>
          )}
          {options.users.length > 0 && (
            <label className="text-xs text-slate-500">User
              <select value={agent} onChange={(e) => setAgent(e.target.value)} className={field}>
                <option value="">All users</option>
                {options.users.map((row) => <option key={row.id} value={row.id}>{personLabel(row)}</option>)}
              </select>
            </label>
          )}
          {options.roles.length > 0 && (
            <label className="text-xs text-slate-500">Role
              <select value={role} onChange={(e) => setRole(e.target.value)} className={field}>
                <option value="">All roles</option>
                {options.roles.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          )}
          <label className="text-xs text-slate-500">Campaign
            <select value={campaign} onChange={(e) => {
              const next = e.target.value;
              setCampaign(next);
              const selected = options.files.find((row) => String(row.id) === fileId);
              if (selected && next && String(selected.campaign_id) !== next) setFileId('');
            }} className={field}>
              <option value="">All campaigns</option>
              {options.campaigns.map((row) => (
                <option key={row.id} value={row.id}>{row.name}{row.campaign_type === 'ibr' ? ' · IVR' : ''}</option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-500">Uploaded file
            <select value={fileId} onChange={(e) => {
              const next = e.target.value;
              setFileId(next);
              const selected = options.files.find((row) => String(row.id) === next);
              if (selected?.campaign_id) setCampaign(String(selected.campaign_id));
            }} className={field}>
              <option value="">All uploaded files</option>
              {files.map((row) => <option key={row.id} value={row.id}>{row.name}{row.campaign_name ? ` · ${row.campaign_name}` : ''}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-500">Call status
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={field}>
              <option value="">Any status</option>
              {options.statuses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-500">Phone
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Number contains" className={field} />
          </label>
        </div>

        <div className="rounded-xl border border-[#E2E8F0] bg-white p-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-xs font-medium text-slate-600">Disposition codes {dispositions.length ? `· ${dispositions.length} selected` : ''}</p>
            {dispositions.length > 0 && <button type="button" className="text-xs text-indigo-600" onClick={() => setDispositions([])}>Clear codes</button>}
          </div>
          <div className="max-h-36 overflow-y-auto grid grid-cols-2 md:grid-cols-3 gap-1">
            {options.dispositions.map((code) => (
              <label key={code} className="flex items-center gap-2 text-xs text-slate-700 px-1 py-0.5">
                <input type="checkbox" checked={dispositions.includes(code)} onChange={() => toggleDisposition(code)} />
                <span className="font-mono">{code}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => download('daily', 'csv')}>Agent CSV</Button>
          <Button variant="secondary" size="sm" onClick={() => download('daily', 'xlsx')}>Agent Excel</Button>
          <Button variant="outline" size="sm" onClick={() => download('campaign', 'xlsx')}>Campaign Excel</Button>
          <Button variant="outline" size="sm" onClick={() => download('calls', 'csv')}>Calls CSV</Button>
          {showIvr && <Button variant="outline" size="sm" onClick={() => download('ibr', 'csv')}>IVR CSV</Button>}
          <Button variant="outline" size="sm" onClick={() => download('leads', 'csv')}>Uploaded file CSV</Button>
          <Button variant="outline" size="sm" onClick={() => { setFrom(''); setTo(''); }}>All dates</Button>
          <Button variant="outline" size="sm" onClick={reset}>Reset</Button>
        </div>
        <p className="text-xs text-slate-400">
          {user?.display_name} · filters apply together. IVR and call downloads include every matching attempt. The uploaded-file download is one row per lead, using its latest disposition.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="p-4"><p className="text-2xl font-bold">{totals.calls}</p><p className="text-xs text-slate-500">Calls</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold">{totals.answered}</p><p className="text-xs text-slate-500">Answered</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold">{totals.unanswered}</p><p className="text-xs text-slate-500">Unanswered</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold">{hms(totals.talk_seconds)}</p><p className="text-xs text-slate-500">Talk</p></Card>
          <Card className="p-4"><p className="text-2xl font-bold">{hms(totals.hold_seconds)}</p><p className="text-xs text-slate-500">Hold</p></Card>
        </div>

        <Card className="overflow-hidden">
          <div className="px-3 py-2 text-xs text-slate-500">{callTotal} matching calls</div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left px-3 py-2">Phone</th>
                <th className="text-left px-3 py-2">Campaign</th>
                <th className="text-left px-3 py-2">File</th>
                <th className="text-left px-3 py-2">Agent</th>
                <th className="text-left px-3 py-2">Disposition</th>
                <th className="text-left px-3 py-2">Started</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((row) => (
                <tr key={row.id} className="border-t border-[#E2E8F0]">
                  <td className="px-3 py-2 font-medium">{row.phone}</td>
                  <td className="px-3 py-2">{row.campaign || '—'}</td>
                  <td className="px-3 py-2">{row.import_file || '—'}</td>
                  <td className="px-3 py-2">{row.agent || '—'}</td>
                  <td className="px-3 py-2"><span className="font-mono text-xs">{row.disposition || '—'}</span></td>
                  <td className="px-3 py-2 text-xs text-slate-500">{String(row.started_at || '').replace('T', ' ').slice(0, 16)}</td>
                </tr>
              ))}
              {calls.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-sm text-slate-400">No calls match these filters.</td></tr>}
            </tbody>
          </table>
        </Card>

        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left px-3 py-2">Agent</th>
                <th className="text-left px-3 py-2">Mode</th>
                <th className="text-left px-3 py-2">Online</th>
                <th className="text-left px-3 py-2">Preview</th>
                <th className="text-left px-3 py-2">Break</th>
                <th className="text-left px-3 py-2">Calls</th>
                <th className="text-left px-3 py-2">Answered</th>
                <th className="text-left px-3 py-2">Talk</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((row) => (
                <tr key={row.user_id} className="border-t border-[#E2E8F0]">
                  <td className="px-3 py-2 font-medium">{row.agent}</td>
                  <td className="px-3 py-2 capitalize">{row.mode}</td>
                  <td className="px-3 py-2 font-mono text-xs">{hms(row.online)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{hms(row.preview)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{hms(row.break)}</td>
                  <td className="px-3 py-2">{row.total_calls}</td>
                  <td className="px-3 py-2">{row.answered}</td>
                  <td className="px-3 py-2 font-mono text-xs">{hms(row.talk_seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                <th className="text-left px-3 py-2">Campaign</th>
                <th className="text-left px-3 py-2">Leads</th>
                <th className="text-left px-3 py-2">Pending</th>
                <th className="text-left px-3 py-2">Answered</th>
                <th className="text-left px-3 py-2">No answer</th>
                <th className="text-left px-3 py-2">Busy</th>
                <th className="text-left px-3 py-2">Connected %</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((row) => (
                <tr key={row.id} className="border-t border-[#E2E8F0]">
                  <td className="px-3 py-2 font-medium">{row.name} {row.code ? `· ${row.code}` : ''}</td>
                  <td className="px-3 py-2">{row.total_leads}</td>
                  <td className="px-3 py-2">{row.pending}</td>
                  <td className="px-3 py-2">{row.answered}</td>
                  <td className="px-3 py-2">{row.no_answer}</td>
                  <td className="px-3 py-2">{row.busy}</td>
                  <td className="px-3 py-2">{row.connected_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
