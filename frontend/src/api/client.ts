const TOKEN_KEY = 'procaller.access';
const REFRESH_KEY = 'procaller.refresh';

export const API_BASE = import.meta.env.VITE_API_BASE || '';

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setTokens(access: string, refresh?: string) {
  localStorage.setItem(TOKEN_KEY, access);
  if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    clearTokens();
    throw new Error('Session expired. Please sign in again.');
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function wsUrl(path: string) {
  const token = getAccessToken();
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = API_BASE ? new URL(API_BASE, window.location.origin).host : window.location.host;
  return `${proto}://${host}${path}?token=${encodeURIComponent(token)}`;
}
