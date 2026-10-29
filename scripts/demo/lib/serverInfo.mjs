import fs from 'node:fs';
import path from 'node:path';
import demoDir from './demoDir.mjs';

// The address and setup token of the demo server, which it writes down when it starts.
export default function serverInfo() {
  const file = path.join(demoDir, 'server.json');
  if (!fs.existsSync(file)) throw new Error(`No demo server has run for ${demoDir}. Start one first: npm run demo:server`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
