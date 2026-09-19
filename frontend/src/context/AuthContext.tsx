import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, clearTokens, setTokens } from '../api/client';
import type { User } from '../api/types';
import { forceStopPhone } from '../hooks/useWebPhone';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('procaller.access');
    if (!token) {
      setLoading(false);
      return;
    }
    api<User>('/api/auth/me/')
      .then(setUser)
      .catch(() => {
        clearTokens();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    async login(email, password) {
      const data = await api<{ access: string; refresh: string; user: User }>('/api/auth/login/', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setTokens(data.access, data.refresh);
      setUser(data.user);
    },
    logout() {
      api('/api/telephony/session/end/', { method: 'POST' }).catch(() => undefined);
      forceStopPhone();
      clearTokens();
      setUser(null);
    },
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
