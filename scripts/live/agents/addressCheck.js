// Webhook and model addresses that point inside the network are refused. Run against a server
// with AGENT_ALLOW_LOCAL_ENDPOINTS unset (--strict) and against one with it on.
//
//   node addressCheck.js --strict    (a server without AGENT_ALLOW_LOCAL_ENDPOINTS)
//   node addressCheck.js             (a server with it on)
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import session from './lib/session.js';
import checks from './lib/checks.js';

const { values: opt } = parseArgs({ options: { state: { type: 'string', default: process.env.LIVE_STATE }, strict: { type: 'boolean', default: false } } });
const state = JSON.parse(fs.readFileSync(opt.state, 'utf8'));
const t = checks(`Address checks (local endpoints ${opt.strict ? 'off' : 'on'})`);
const owner = session(state.url, { cookie: state.people.owner.cookie });
const reader = state.agents.reader.id;
const hook = (url) => owner('PUT', `/api/agents/${reader}/webhook`, { url });
const model = (endpoint) => owner('POST', '/api/agents', { name: `Probe${Math.random().toString(36).slice(2, 7)}`, runner: 'openai', model: 'test-model', endpoint });

// always refused: link-local, cloud metadata, and tricks that spell them differently
for (const url of ['http://169.254.169.254/latest/meta-data/', 'https://169.254.169.254/', 'http://[fe80::1]/', 'https://[fe80::1]/', 'https://[::ffff:169.254.169.254]/', 'https://0xa9fea9fe/', 'https://2852039166/', 'http://user:pw@example.com/']) {
  const res = await hook(url);
  t.ok(res.status === 400, `webhook ${url} is refused`, res.data.error);
}
const meta = await model('http://169.254.169.254/v1');
t.ok(meta.status === 400, 'a model endpoint on the metadata address is refused', meta.data.error);
const metaTls = await model('https://169.254.169.254/v1');
t.ok(metaTls.status === 400 && /metadata/.test(metaTls.data.error), 'over https too, named as a metadata address', metaTls.data.error);

const local = ['http://127.0.0.1:4700/nil', 'https://127.0.0.1/', 'https://localhost/', 'https://10.0.0.5/', 'https://192.168.1.10/', 'https://172.16.0.1/', 'https://[::1]/', 'https://2130706433/', 'https://0x7f000001/', 'https://[::ffff:127.0.0.1]/', 'https://100.64.0.1/', 'https://0.0.0.0/'];
if (opt.strict) {
  for (const url of local) {
    const res = await hook(url);
    t.ok(res.status === 400, `webhook ${url} is refused`, res.data.error);
  }
  const plain = await hook('http://example.com/hook');
  t.ok(plain.status === 400 && /Use an https URL/.test(plain.data.error), 'plain http to a public host is refused', plain.data.error);
  const ollama = await model('http://127.0.0.1:11434/v1');
  t.ok(ollama.status === 400 && /local endpoints/.test(ollama.data.error), 'a local model endpoint needs local endpoints switched on', ollama.data.error);
} else {
  const res = await hook('http://127.0.0.1:4700/nil');
  t.ok(res.status === 200, 'with local endpoints on, a loopback http webhook is accepted', res.data.error);
  const ollama = await model('http://127.0.0.1:11434/v1');
  t.ok(ollama.status === 200, 'and a local model endpoint', ollama.data.error);
  if (ollama.data.agent) await owner('DELETE', `/api/agents/${ollama.data.agent.id}`);
  await owner('DELETE', `/api/agents/${reader}/webhook`);
}
t.done();
