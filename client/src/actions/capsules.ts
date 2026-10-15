import http from '../api/http';
import ApiError from '../api/ApiError';
import saveBlob from '../lib/saveBlob';
import session from './session';

// Header values must be Latin-1, so the passphrase travels base64-encoded (inside HTTPS).
const encode = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

const capsules = {
  async download(passphrase: string) {
    const res = await fetch('/api/export/capsule', {
      method: 'POST',
      headers: { 'X-NONOS': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase }),
      credentials: 'same-origin',
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new ApiError(res.status, data?.error ?? 'Couldn’t create the capsule.');
    }
    const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'nonos.capsule';
    saveBlob(await res.blob(), name);
  },

  async restore(file: File, passphrase: string) {
    await http.send('/auth/restore', file, { 'X-Capsule-Passphrase': encode(passphrase) });
    await session.boot();
  },
};

export default capsules;
