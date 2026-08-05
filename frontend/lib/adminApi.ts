'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

const TOKEN_KEY = 'trustqr_admin_access';
const REFRESH_KEY = 'trustqr_admin_refresh';

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

// Mirrors the access token into a plain cookie (same exposure as localStorage under XSS,
// so no security downside) so server components — e.g. the public /v/[code] desktop gate —
// can recognize a logged-in admin browser and skip the mobile-only restriction for them.
function setAccessCookie(token: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=900; samesite=lax`;
}

function clearAccessCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(TOKEN_KEY, access);
  localStorage.setItem(REFRESH_KEY, refresh);
  setAccessCookie(access);
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  clearAccessCookie();
}

async function refreshAccessToken(): Promise<string | null> {
  const refresh = typeof window !== 'undefined' ? localStorage.getItem(REFRESH_KEY) : null;
  if (!refresh) return null;
  const res = await fetch(`${API_URL}/api/v1/admin/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  localStorage.setItem(TOKEN_KEY, data.access_token);
  setAccessCookie(data.access_token);
  return data.access_token;
}

export async function api<T = any>(
  path: string,
  opts: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const doFetch = async (token: string | null) => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((opts.headers as Record<string, string>) || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${API_URL}${path}`, { ...opts, headers });
  };

  let token = getAccessToken();
  let res = await doFetch(token);

  if (res.status === 401 && token) {
    token = await refreshAccessToken();
    if (token) res = await doFetch(token);
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // maybe non-JSON (CSV/ZIP downloads use different flow)
  }
  return {
    ok: res.ok,
    status: res.status,
    data,
    error: !res.ok ? (data?.error || res.statusText) : undefined,
  };
}

// For file downloads
export async function download(path: string, filename: string) {
  const token = getAccessToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Multipart form upload. Content-Type is left unset so the browser fills in
// the multipart boundary itself; setting it manually breaks the upload.
export async function uploadForm<T = any>(
  path: string,
  formData: FormData
): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const doFetch = async (token: string | null) => {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${API_URL}${path}`, { method: 'POST', headers, body: formData });
  };

  let token = getAccessToken();
  let res = await doFetch(token);
  if (res.status === 401 && token) {
    token = await refreshAccessToken();
    if (token) res = await doFetch(token);
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // no body
  }
  return {
    ok: res.ok,
    status: res.status,
    data,
    error: !res.ok ? data?.error || res.statusText : undefined,
  };
}

// POST + JSON body file download, for export endpoints that take parameters
// too complex for a query string (e.g. print export options).
export async function downloadPost(path: string, body: any, filename: string) {
  const doFetch = async (token: string | null) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${API_URL}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  };

  let token = getAccessToken();
  let res = await doFetch(token);
  if (res.status === 401 && token) {
    token = await refreshAccessToken();
    if (token) res = await doFetch(token);
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      msg = data?.error || msg;
    } catch {
      // no body
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Fetches an authenticated binary resource and returns a blob: URL, since
// <img src> can't carry an Authorization header itself.
export async function fetchBlobUrl(path: string): Promise<string> {
  const doFetch = async (token: string | null) => {
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${API_URL}${path}`, { headers });
  };

  let token = getAccessToken();
  let res = await doFetch(token);
  if (res.status === 401 && token) {
    token = await refreshAccessToken();
    if (token) res = await doFetch(token);
  }
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
