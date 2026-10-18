// The encodings the server can send, best first.
const OURS = ['br', 'gzip'];

// Which of our encodings a request's Accept-Encoding header allows, or null for none. An
// encoding listed with q=0 is refused, and * stands for any encoding the header doesn't name.
export default function pickEncoding(header = '') {
  const offered = new Map();
  for (const part of String(header).split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    if (!name) continue;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    offered.set(name.trim(), q ? Number(q.slice(2)) : 1);
  }
  return OURS.find((name) => (offered.get(name) ?? offered.get('*') ?? 0) > 0) ?? null;
}
