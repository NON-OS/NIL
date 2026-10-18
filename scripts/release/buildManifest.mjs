import { createHash } from 'node:crypto';
import servedFiles from './servedFiles.mjs';

// The release manifest of a web build: its version and every file a browser can be sent, each
// with its SHA-256. The text is only ever written one way (fixed key order, one file per line, a
// newline at the end), so the same build always gives the same bytes. The release hash is the
// SHA-256 of those bytes, and it's the one number a release publishes.
export default function buildManifest(dist, version) {
  const files = servedFiles(dist);
  const lines = files.map(([file, sha], i) => `    ${JSON.stringify(file)}: "${sha}"${i < files.length - 1 ? ',' : ''}`);
  const text = `{\n  "name": "nil-web",\n  "version": ${JSON.stringify(version)},\n  "files": {\n${lines.join('\n')}\n  }\n}\n`;
  return { text, hash: createHash('sha256').update(text).digest('hex'), files };
}
