import { createHash } from 'node:crypto';

// Fetches one URL the way a browser opening the app would, past any cache, and returns the
// status, the headers and the SHA-256 of the body. Redirects are reported, not followed: the
// check is about what this exact address sends.
export default async function fetchFile(url, userAgent) {
  const res = await fetch(url, { headers: { 'User-Agent': userAgent, 'Cache-Control': 'no-cache' }, redirect: 'manual' });
  const body = Buffer.from(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, sha: createHash('sha256').update(body).digest('hex') };
}
