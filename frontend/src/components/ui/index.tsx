import React, { useState, useRef, useEffect } from 'react';

// ─── Badge ───────────────────────────────────────────────────────────────────
type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'purple';
interface BadgeProps { variant?: BadgeVariant; children: React.ReactNode; className?: string; dot?: boolean; }

const badgeStyles: Record<BadgeVariant, string> = {
  default: 'bg-[#EEF2FF] text-[#4338CA]',
  success: 'bg-green-50 text-green-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-blue-50 text-blue-700',
  muted: 'bg-slate-100 text-slate-500',
  purple: 'bg-purple-50 text-purple-700',
};

const dotColors: Record<BadgeVariant, string> = {
  default: 'bg-indigo-500',
  success: 'bg-green-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-blue-500',
  muted: 'bg-slate-400',
  purple: 'bg-purple-500',
};

export function Badge({ variant = 'default', children, className = '', dot }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${badgeStyles[variant]} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColors[variant]}`} />}
      {children}
    </span>
  );
}

// ─── Avatar ──────────────────────────────────────────────────────────────────
interface AvatarProps { initials: string; size?: 'sm' | 'md' | 'lg'; color?: string; status?: 'available' | 'on_call' | 'break' | 'offline' | 'wrap_up'; }

const statusColors: Record<string, string> = {
  available: 'bg-green-400',
  on_call: 'bg-indigo-500',
  wrap_up: 'bg-amber-400',
  break: 'bg-orange-400',
  offline: 'bg-slate-300',
};

const avatarSizes: Record<string, string> = {
  sm: 'w-7 h-7 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-12 h-12 text-base',
};

const colors = ['bg-indigo-100 text-indigo-700','bg-purple-100 text-purple-700','bg-blue-100 text-blue-700','bg-green-100 text-green-700','bg-amber-100 text-amber-700','bg-rose-100 text-rose-700'];

export function Avatar({ initials, size = 'md', status }: AvatarProps) {
  const hash = initials.charCodeAt(0) % colors.length;
  return (
    <div className="relative inline-flex shrink-0">
      <div className={`${avatarSizes[size]} ${colors[hash]} rounded-full flex items-center justify-center font-semibold`}>
        {initials}
      </div>
      {status && (
        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${statusColors[status]}`} />
      )}
    </div>
  );
}

// ─── Button ──────────────────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant; size?: ButtonSize; icon?: React.ReactNode; loading?: boolean;
}

const btnVariants: Record<ButtonVariant, string> = {
  primary: 'bg-[#4F46E5] hover:bg-[#4338CA] text-white shadow-sm',
  secondary: 'bg-slate-100 hover:bg-slate-200 text-slate-700',
  ghost: 'hover:bg-slate-100 text-slate-600',
  danger: 'bg-red-500 hover:bg-red-600 text-white shadow-sm',
  outline: 'border border-[#E2E8F0] hover:bg-slate-50 text-slate-700 bg-white',
};

const btnSizes: Record<ButtonSize, string> = {
  sm: 'h-7 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-6 text-sm gap-2',
};

export function Button({ variant = 'secondary', size = 'md', icon, loading, children, className = '', disabled, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${btnVariants[variant]} ${btnSizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, className = '', onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`bg-white border border-[#E2E8F0] rounded-xl ${onClick ? 'cursor-pointer hover:border-[#C7D2FE] hover:shadow-sm' : ''} transition-all ${className}`}>
      {children}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
interface StatCardProps { label: string; value: string | number; trend?: number; period?: string; icon?: React.ReactNode; color?: string; }

export function StatCard({ label, value, trend, period, icon, color = 'text-indigo-600' }: StatCardProps) {
  const isPositive = trend !== undefined && trend > 0;
  const isNegative = trend !== undefined && trend < 0;
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        {icon && <div className={`${color} opacity-70`}>{icon}</div>}
      </div>
      <p className="text-2xl font-bold text-slate-900 mb-1">{value}</p>
      {trend !== undefined && (
        <p className={`text-xs font-medium ${isPositive ? 'text-green-600' : isNegative ? 'text-red-500' : 'text-slate-400'}`}>
          {isPositive ? '↑' : isNegative ? '↓' : '—'} {Math.abs(trend)}% <span className="text-slate-400 font-normal">{period}</span>
        </p>
      )}
    </Card>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> { label?: string; icon?: React.ReactNode; error?: string; }

export function Input({ label, icon, error, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>}
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icon}</span>}
        <input
          className={`w-full h-9 rounded-lg border border-[#E2E8F0] bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 focus:border-[#4F46E5] transition-all ${icon ? 'pl-9' : 'pl-3'} pr-3 ${error ? 'border-red-400' : ''} ${className}`}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> { label?: string; options: { value: string; label: string }[]; }

export function Select({ label, options, className = '', ...props }: SelectProps) {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>}
      <select className={`w-full h-9 rounded-lg border border-[#E2E8F0] bg-white text-sm text-slate-900 pl-3 pr-8 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 focus:border-[#4F46E5] transition-all cursor-pointer ${className}`} {...props}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
interface ModalProps { open: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; }

const modalSizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' };

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${modalSizes[size]} bg-white rounded-2xl shadow-2xl fade-in max-h-[90vh] overflow-auto`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0]">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">✕</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
interface Tab { id: string; label: string; count?: number; }
interface TabsProps { tabs: Tab[]; active: string; onChange: (id: string) => void; }

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="flex gap-1 border-b border-[#E2E8F0]">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-all -mb-px ${active === tab.id ? 'border-[#4F46E5] text-[#4F46E5]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={`ml-2 px-1.5 py-0.5 rounded-full text-xs ${active === tab.id ? 'bg-[#EEF2FF] text-[#4F46E5]' : 'bg-slate-100 text-slate-500'}`}>{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
export function AgentStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeVariant }> = {
    available: { label: 'Available', variant: 'success' },
    on_call: { label: 'On Call', variant: 'default' },
    wrap_up: { label: 'Wrap-up', variant: 'warning' },
    break: { label: 'Break', variant: 'warning' },
    offline: { label: 'Offline', variant: 'muted' },
  };
  const s = map[status] || { label: status, variant: 'muted' as BadgeVariant };
  return <Badge variant={s.variant} dot>{s.label}</Badge>;
}

// ─── Call Status Badge ────────────────────────────────────────────────────────
export function CallStatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeVariant> = {
    Connected: 'success', Missed: 'danger', Busy: 'warning', Failed: 'danger', 'No Answer': 'muted', Voicemail: 'info',
  };
  return <Badge variant={map[status] || 'muted'}>{status}</Badge>;
}

// ─── Empty State ──────────────────────────────────────────────────────────────
interface EmptyStateProps { icon: string; title: string; description: string; action?: { label: string; onClick: () => void }; }

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
      <div className="w-12 h-12 flex items-center justify-center text-2xl text-slate-300 mb-4">{icon}</div>
      <h3 className="text-sm font-semibold text-slate-700 mb-1">{title}</h3>
      <p className="text-sm text-slate-400 max-w-sm mb-6">{description}</p>
      {action && <Button variant="primary" size="sm" onClick={action.onClick}>{action.label}</Button>}
    </div>
  );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
export function Tooltip({ children, content }: { children: React.ReactNode; content: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative inline-flex" onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
      {children}
      {visible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-xs rounded-md whitespace-nowrap z-50 pointer-events-none">
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
        </div>
      )}
    </div>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
export function ProgressBar({ value, max, color = 'bg-[#4F46E5]', className = '' }: { value: number; max: number; color?: string; className?: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className={`h-1.5 bg-slate-100 rounded-full overflow-hidden ${className}`}>
      <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'info' | 'warning';
interface ToastItem { id: string; type: ToastType; message: string; }

const toastColors: Record<ToastType, string> = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
};

const toastIcons: Record<ToastType, string> = {
  success: '✓', error: '✕', info: 'ℹ', warning: '⚠',
};

export function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
      {toasts.map(t => (
        <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg text-sm font-medium fade-in ${toastColors[t.type]}`}>
          <span>{toastIcons[t.type]}</span>
          <span>{t.message}</span>
          <button onClick={() => onDismiss(t.id)} className="ml-2 opacity-60 hover:opacity-100">✕</button>
        </div>
      ))}
    </div>
  );
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const show = (message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(p => [...p, { id, type, message }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  };
  const dismiss = (id: string) => setToasts(p => p.filter(t => t.id !== id));
  return { toasts, show, dismiss };
}

// ─── Search Input ─────────────────────────────────────────────────────────────
export function SearchInput({ placeholder, value, onChange }: { placeholder?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
      <input
        type="text"
        placeholder={placeholder || 'Search...'}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-9 w-full pl-9 pr-3 rounded-lg border border-[#E2E8F0] bg-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 focus:border-[#4F46E5] transition-all"
      />
    </div>
  );
}

// ─── Score Ring ───────────────────────────────────────────────────────────────
export function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? '#22C55E' : score >= 60 ? '#F59E0B' : '#EF4444';
  const r = 18; const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <div className="relative inline-flex items-center justify-center w-12 h-12">
      <svg className="-rotate-90" width="48" height="48">
        <circle cx="24" cy="24" r={r} fill="none" stroke="#E2E8F0" strokeWidth="3" />
        <circle cx="24" cy="24" r={r} fill="none" stroke={color} strokeWidth="3" strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-500" />
      </svg>
      <span className="absolute text-xs font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────
export function Drawer({ open, onClose, title, children, width = 'max-w-lg' }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; width?: string }) {
  return (
    <>
      {open && <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={onClose} />}
      <div className={`fixed top-0 right-0 h-full ${width} w-full bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] shrink-0">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </>
  );
}
