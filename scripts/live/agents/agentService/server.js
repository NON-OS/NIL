// A small outside agent driven by Nil's webhooks. It checks every delivery's signature and
// timestamp as docs/ai-agents.md describes, ignores duplicates by Nil-Delivery, answers 200 at
// once and then does the work with the local model and the REST API.
//
//   node agentService/server.js --state <run dir>/state.json [--port 4700]
//
// For the webhook checks it can misbehave on purpose: POST /control {"mode": "fail" | "slow" |
// "redirect" | "ok", "work": false, "secret": "..."}. GET /log lists every delivery it got,
// GET /work every piece of work it did. Both listen on 127.0.0.1 only.
import fs from 'node:fs';
import http from 'node:http';
import { parseArgs } from 'node:util';
import openapiClient from '../lib/openapiClient.js';
import verify from './verify.js';
import work from './work.js';

const { values: opt } = parseArgs({
  options: {
    state: { type: 'string', default: process.env.LIVE_STATE },
    port: { type: 'string', default: process.env.AGENT_SERVICE_PORT ?? '4700' },
    agent: { type: 'string', default: 'scout' },
    endpoint: { type: 'string', default: process.env.LOCAL_MODEL_URL ?? 'http://127.0.0.1:11434/v1' },
    // the alias startOllama.sh creates; any model name your server lists works
    model: { type: 'string', default: process.env.LOCAL_MODEL || 'local-agent' },
    log: { type: 'string', default: process.env.LIVE_DIR ? `${process.env.LIVE_DIR}/agent-service.jsonl` : 'agent-service.jsonl' },
  },
});

const state = () => JSON.parse(fs.readFileSync(opt.state, 'utf8'));
const settings = { mode: 'ok', work: true, secret: null, tolerance: Number(process.env.AGENT_WEBHOOK_TOLERANCE_SECONDS ?? 300) };
const received = [];
const done = [];
const seen = new Set();
const queue = [];
let busy = false;

const say = (text) => console.log(`[agent-service ${new Date().toISOString().slice(11, 19)}] ${text}`);
const record = (entry) => {
  received.push(entry);
  fs.appendFileSync(opt.log, `${JSON.stringify(entry)}\n`);
};

async function drain() {
  if (busy) return;
  busy = true;
  while (queue.length) {
    const event = queue.shift();
    const s = state();
    const agent = s.agents[opt.agent];
    try {
      const api = await openapiClient(`${s.url}/api/agent/v1/openapi.json`, { key: agent.key });
      say(`working on ${event.type} ${event.data?.task?.key ?? ''}`);
      const result = await work(event, { api, agentName: event.agent?.name ?? 'Scout', model: { endpoint: opt.endpoint, model: opt.model }, log: say });
      done.push({ delivery: event.id, type: event.type, at: new Date().toISOString(), ...result });
      say(`finished ${event.type} ${event.data?.task?.key ?? ''}: ${JSON.stringify(result.calls ?? result.skipped)}`);
    } catch (err) {
      done.push({ delivery: event.id, type: event.type, error: err.message });
      say(`failed ${event.type}: ${err.message}`);
    }
  }
  busy = false;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const json = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  const raw = await readBody(req);
  if (req.method === 'GET' && req.url === '/log') return json(res, 200, received);
  if (req.method === 'GET' && req.url === '/work') return json(res, 200, { busy, queued: queue.length, done });
  if (req.method === 'POST' && req.url === '/control') {
    Object.assign(settings, JSON.parse(raw.toString() || '{}'));
    say(`control: mode=${settings.mode} work=${settings.work}${settings.secret ? ' secret=set' : ''}`);
    return json(res, 200, { ...settings, secret: settings.secret ? 'set' : null });
  }
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' });

  const signature = req.headers['nil-signature'] ?? '';
  const delivery = req.headers['nil-delivery'];
  const secret = settings.secret ?? state().agents[opt.agent].webhookSecret;
  const valid = Boolean(secret && signature) && verify(secret, String(signature), raw.toString('utf8'), settings.tolerance);
  let body = null;
  try {
    body = JSON.parse(raw.toString('utf8'));
  } catch {}
  const entry = {
    at: new Date().toISOString(),
    path: req.url,
    event: req.headers['nil-event'],
    delivery,
    timestamp: req.headers['nil-timestamp'],
    signature,
    userAgent: req.headers['user-agent'],
    valid,
    duplicate: Boolean(delivery && seen.has(delivery)),
    mode: settings.mode,
    body,
    // the exact bytes, so the documented Python check can be run over them later
    raw: raw.toString('utf8'),
  };
  record(entry);
  if (!valid) {
    say(`refused a delivery with a bad signature (${entry.event} ${delivery})`);
    return json(res, 401, { error: 'bad signature' });
  }
  if (settings.mode === 'fail') return json(res, 500, { error: 'failing on purpose' });
  if (settings.mode === 'redirect') {
    res.writeHead(302, { Location: 'http://127.0.0.1:1/elsewhere' });
    return res.end();
  }
  if (settings.mode === 'slow') await new Promise((r) => setTimeout(r, 15_000));
  if (entry.duplicate) return json(res, 200, { duplicate: true });
  seen.add(delivery);
  say(`got ${entry.event} ${body?.data?.task?.key ?? ''} (delivery ${delivery})`);
  if (settings.work && body) {
    queue.push(body);
    setImmediate(drain);
  }
  json(res, 200, { ok: true });
});

server.listen(Number(opt.port), '127.0.0.1', () => say(`listening on http://127.0.0.1:${opt.port}, model ${opt.model} at ${opt.endpoint}`));
