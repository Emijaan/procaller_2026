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

export async function apiUpload<T>(path: string, body: FormData): Promise<T> {
  const headers = new Headers();
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body });
  if (res.status === 401) {
    clearTokens();
    throw new Error('Session expired. Please sign in again.');
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const bodyJson = await res.json();
      detail = bodyJson.detail || JSON.stringify(bodyJson);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

function filenameFromDisposition(header: string | null, fallback: string) {
  if (!header) return fallback;
  const starred = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (starred?.[1]) return decodeURIComponent(starred[1]);
  const quoted = header.match(/filename="([^"]+)"/i);
  if (quoted?.[1]) return quoted[1];
  const plain = header.match(/filename=([^;]+)/i);
  return plain?.[1]?.trim() || fallback;
}

export async function apiBlob(path: string, options: RequestInit = {}): Promise<{ blob: Blob; filename: string }> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
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
  const blob = await res.blob();
  return { blob, filename: filenameFromDisposition(res.headers.get('Content-Disposition'), 'download') };
}

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function wsUrl(path: string) {
  const token = getAccessToken();
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = API_BASE ? new URL(API_BASE, window.location.origin).host : window.location.host;
  return `${proto}://${host}${path}?token=${encodeURIComponent(token)}`;
}
