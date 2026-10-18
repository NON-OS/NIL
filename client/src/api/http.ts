import ApiError from './ApiError';

let onSessionEnded: (() => void) | null = null;

const OFFLINE = 'You seem to be offline. Check your connection and try again.';

async function request<T>(method: string, url: string, body?: unknown, extraHeaders: Record<string, string> = {}, credentials: RequestCredentials = 'same-origin'): Promise<T> {
  // X-NONOS is the server's CSRF check; same-origin fetches are the only ones that can send it.
  const headers: Record<string, string> = { 'X-NONOS': '1', ...extraHeaders };
  let payload: BodyInit | undefined;
  if (body instanceof Blob) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(`/api${url}`, { method, headers, body: payload, credentials, cache: 'no-store' });
  } catch {
    throw new ApiError(0, OFFLINE);
  }

  if (res.status === 401 && !url.startsWith('/auth/')) onSessionEnded?.();
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status}).`);
  return data as T;
}

// A file's raw bytes, for the browser to decrypt or re-encrypt itself.
async function bytes(url: string) {
  let res: Response;
  try {
    res = await fetch(`/api${url}`, { credentials: 'same-origin', cache: 'no-store' });
  } catch {
    throw new ApiError(0, OFFLINE);
  }
  if (res.status === 401) onSessionEnded?.();
  if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => null))?.error ?? `Request failed (${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}

const http = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown = {}) => request<T>('POST', url, body),
  put: <T>(url: string, body: unknown = {}) => request<T>('PUT', url, body),
  patch: <T>(url: string, body: unknown = {}) => request<T>('PATCH', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
  bytes,
  // sent without the session cookie, so the server can't tell whose request it is
  anonymous: <T>(url: string, body: unknown) => request<T>('POST', url, body, {}, 'omit'),
  anonymousGet: <T>(url: string) => request<T>('GET', url, undefined, {}, 'omit'),
  send: <T>(url: string, body: Blob, headers: Record<string, string>) => request<T>('POST', url, body, { 'Content-Type': 'application/octet-stream', ...headers }),
  upload: <T>(url: string, file: File) =>
    request<T>('POST', url, file, { 'Content-Type': file.type || 'application/octet-stream', 'X-Filename': encodeURIComponent(file.name) }),
  onSessionEnded(handler: () => void) {
    onSessionEnded = handler;
  },
};

export default http;
