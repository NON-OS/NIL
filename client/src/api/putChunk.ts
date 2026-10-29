import ApiError from './ApiError';

type Sent = { status: number; text: string; retryAfter: number };

const OFFLINE = 'You seem to be offline. Check your connection and try again.';
// a dropped connection or a server restarting gets this many more tries, further apart each time
const RETRIES = [1000, 3000, 8000];
// and a server asking to slow down is waited for, up to this long at a time
const LONGEST_WAIT = 60_000;
const MOST_WAITS = 10;
const stopped = () => new DOMException('The upload was stopped.', 'AbortError');

// XMLHttpRequest, where there is one, because it reports how much of the body has gone out.
function send(url: string, body: Uint8Array, onSent: (bytes: number) => void, signal?: AbortSignal): Promise<Sent> {
  if (typeof XMLHttpRequest === 'undefined') {
    return fetch(`/api${url}`, { method: 'PUT', body, credentials: 'same-origin', signal, headers: { 'X-NONOS': '1', 'Content-Type': 'application/octet-stream' } }).then(
      async (res) => ({ status: res.status, text: await res.text(), retryAfter: Number(res.headers.get('Retry-After')) || 0 }),
      (err) => (signal?.aborted ? Promise.reject(err) : { status: 0, text: '', retryAfter: 0 }),
    );
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api${url}`);
    xhr.setRequestHeader('X-NONOS', '1');
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (e) => onSent(e.loaded);
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText, retryAfter: Number(xhr.getResponseHeader('Retry-After')) || 0 });
    xhr.onerror = () => resolve({ status: 0, text: '', retryAfter: 0 });
    xhr.onabort = () => reject(stopped());
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

// until the browser says it's back online, however long that takes
const online = (signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const back = () => (signal?.removeEventListener('abort', stop), resolve());
    const stop = () => (window.removeEventListener('online', back), reject(stopped()));
    window.addEventListener('online', back, { once: true });
    signal?.addEventListener('abort', stop, { once: true });
  });

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(timer), reject(stopped())), { once: true });
  });

function failure({ status, text }: Sent) {
  let message = status ? `Request failed (${status}).` : OFFLINE;
  try {
    message = JSON.parse(text)?.error ?? message;
  } catch {}
  return new ApiError(status, message);
}

// Sends one chunk of a sealed blob as raw bytes. `onSent` hears how many of its bytes have gone
// out so far. A browser that's gone offline waits until it's back; a dropped connection or a
// server that's restarting is tried again a few times, and a server asking to slow down is waited
// for; any other refusal is final.
export default async function putChunk(url: string, body: Uint8Array, { onSent = () => {}, signal }: { onSent?: (bytes: number) => void; signal?: AbortSignal } = {}) {
  for (let tries = 0, waits = 0; ; ) {
    if (signal?.aborted) throw stopped();
    const sent = await send(url, body, onSent, signal);
    if (sent.status >= 200 && sent.status < 300) return;
    onSent(0);
    if (sent.status === 0 && typeof navigator !== 'undefined' && navigator.onLine === false) await online(signal);
    else if (sent.status === 429 && sent.retryAfter && waits++ < MOST_WAITS) await wait(Math.min(sent.retryAfter * 1000, LONGEST_WAIT), signal);
    else if ([0, 502, 503, 504].includes(sent.status) && tries < RETRIES.length) await wait(RETRIES[tries++], signal);
    else throw failure(sent);
  }
}
