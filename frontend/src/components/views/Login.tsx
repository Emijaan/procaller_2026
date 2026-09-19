import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('agent@apinfotech.com');
  const [password, setPassword] = useState('ProCaller@2026');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-[#0F172A] p-12">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#4F46E5] flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <div>
            <span className="text-white font-bold text-xl tracking-tight">ProCaller</span>
            <span className="block text-[10px] text-[#818CF8] uppercase tracking-widest">by AP Infotech and Cyber Solution</span>
          </div>
        </div>

        <div>
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Your calling floor.<br />Built for agents.
          </h1>
          <p className="text-[#64748B] text-lg leading-relaxed mb-8">
            Manual WebRTC dialing first. Campaigns, hopper, and predictive dial come next — without locking you to VICIdial.
          </p>
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: '📞', label: 'Manual dial', sub: 'click-to-call now' },
              { icon: '🌐', label: 'WebRTC phone', sub: 'in the browser' },
              { icon: '🗂', label: 'Dispositions', sub: 'saved to Postgres' },
              { icon: '🔐', label: 'Agent login', sub: 'role-ready' },
            ].map((f) => (
              <div key={f.label} className="flex items-center gap-3 bg-white/5 rounded-xl p-3">
                <span className="text-xl">{f.icon}</span>
                <div>
                  <p className="text-white font-semibold text-sm">{f.label}</p>
                  <p className="text-[#64748B] text-xs">{f.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-6 text-xs text-[#475569]">
          <span>© 2026 AP Infotech and Cyber Solution</span>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center bg-[#F8FAFC] p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-8 h-8 rounded-lg bg-[#4F46E5] flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <span className="font-bold text-slate-900 text-lg">ProCaller</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-1">Welcome back</h2>
            <p className="text-slate-500 text-sm">Sign in to your ProCaller workspace</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Work Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 focus:border-[#4F46E5] transition-all"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/30 focus:border-[#4F46E5] transition-all"
                placeholder="••••••••"
              />
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-xl bg-[#4F46E5] hover:bg-[#4338CA] text-white font-semibold transition-all shadow-lg shadow-indigo-200 disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {loading ? (
                <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Signing in...</>
              ) : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-6">
            Demo agent: agent@apinfotech.com · ProCaller@2026
          </p>
        </div>
      </div>
    </div>
  );
}
