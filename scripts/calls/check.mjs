// Calls in real browsers: three people in Chromium, Firefox or WebKit with fake cameras and microphones, through a
// real coturn on this machine (scripts/calls/turn.mjs). It checks that calls connect through
// the relay and nowhere else, survive the relay going away and coming back (ICE restart), that
// a server can read no call message and one it changes is refused, that a three-way project
// call works, and runs axe on the call screen at desktop and phone sizes. Needs `npm run build` first.
//
//   node scripts/calls/check.mjs [--browser chromium|firefox|webkit] [--long] [--shots <dir>]
//
// --long runs scripts/calls/longCall.mjs instead: a call past several relay passwords, and a
// network change under it.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import AxeBuilder from '@axe-core/playwright';
import turn from './turn.mjs';
import browsers from './browsers.mjs';
import sfu from './sfu.mjs';
import steps from './steps.mjs';
import longCall from './longCall.mjs';

const { values: opt } = parseArgs({ options: { long: { type: 'boolean', default: false }, browser: { type: 'string', default: 'chromium' }, shots: { type: 'string' }, port: { type: 'string', default: process.env.CALLS_PORT ?? '3991' } } });
const world = createRequire(import.meta.url)('../a11y/world.cjs');
const SIZES = {
  desktop: { viewport: { width: 1440, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
};

if (!browsers.names.includes(opt.browser)) throw new Error(`--browser is one of ${browsers.names.join(', ')}`);
const browser = await browsers.launch(opt.browser);
console.log(`${opt.browser} ${browser.version()}`);
const relay = turn();
if (!relay) console.log('coturn is not installed here; calls are checked with direct connections only.');
await relay?.start();
// with an SFU, calls of more than two move to it, so the three-way call checks the SFU
const forwarder = relay && browsers.capture(opt.browser) && !opt.long ? await sfu() : null;
if (!forwarder) console.log('No SFU here (set LIVEKIT_SERVER); every call goes browser to browser.');
// the long call has the relay over UDP and TCP, and passwords that last a minute
const relayUrls = opt.long ? `${relay.url},${relay.url.replace('udp', 'tcp')}` : relay?.url;
const app = await world({ port: Number(opt.port), env: relay ? { TURN_URLS: relayUrls, TURN_SECRET: relay.secret, TURN_TTL_SECONDS: opt.long ? '60' : '600', ...(forwarder ? { ...forwarder.env, CALL_MESH_MAX_PEERS: '2' } : {}) } : {} });
if (opt.shots) fs.mkdirSync(opt.shots, { recursive: true });

async function person(size, { tamper } = {}) {
  const context = await browser.newContext({ ...browsers.contextOptions(opt.browser, SIZES[size]), colorScheme: 'light' });
  // every peer connection the page makes, so the check can read its statistics
  await context.addInitScript(() => {
    const Native = window.RTCPeerConnection;
    window.__pcs = [];
    window.RTCPeerConnection = class extends Native {
      constructor(...args) {
        super(...args);
        window.__pcs.push(this);
        // what each connection went through, for when a check fails
        this.__log = [];
        const log = (what) => this.__log.push(`${new Date().toISOString().slice(14, 23)} ${what}`);
        this.addEventListener('iceconnectionstatechange', () => log(`ice ${this.iceConnectionState}`));
        this.addEventListener('icegatheringstatechange', () => log(`gathering ${this.iceGatheringState}`));
        this.addEventListener('signalingstatechange', () => log(`signaling ${this.signalingState}`));
        this.addEventListener('icecandidate', (e) => log(`candidate ${e.candidate ? e.candidate.type : 'done'}`));
        this.addEventListener('icecandidateerror', (e) => log(`candidate error ${e.errorCode} ${e.errorText}`));
      }
    };
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error(`${size}: page error: ${e.message}`));
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.error(`${size}: console ${m.type()}: ${m.text().replace(/(access_token|join_request)=[^&\s']+/g, '$1=…').slice(0, 400)}`));
  if (tamper) {
    // a dishonest server, looking at every message browsers in a call send this one: it counts
    // any it can read, and while `tamper.on` is set it changes a byte in each on the way
    await page.routeWebSocket('**/ws', (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((m) => server.send(m));
      server.onMessage((m) => {
        if (typeof m !== 'string' || !m.includes('"call.signal"')) return ws.send(m);
        const event = JSON.parse(m);
        const blob = JSON.parse(event.blob);
        tamper.seen += 1;
        if (blob.type !== 'sealed' || /"sdp"|a=fingerprint|a=candidate|"media-key"/.test(event.blob)) tamper.readable += 1;
        if (tamper.on && typeof blob.box === 'string') {
          blob.box = blob.box.slice(0, 80) + (blob.box[80] === 'A' ? 'B' : 'A') + blob.box.slice(81);
          tamper.hits += 1;
        }
        ws.send(JSON.stringify({ ...event, blob: JSON.stringify(blob) }));
      });
    });
  }
  return { page, key: app.newKey(), size, wallet: (key) => app.wallet(page, key) };
}

async function axe(page, name) {
  const { violations } = await new AxeBuilder({ page }).analyze();
  const bad = violations.filter((v) => ['serious', 'critical'].includes(v.impact));
  check(`axe: ${name}`, bad.length === 0, bad.map((v) => `${v.id} ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`).join('; '));
}

async function shot(page, name) {
  if (opt.shots) await page.screenshot({ path: path.join(opt.shots, `${opt.browser}-${name}.png`) });
}

const tamper = { on: false, hits: 0, seen: 0, readable: 0 };
const people = {};
try {
  people.ada = await person('desktop');
  people.ana = await person('phone');
  people.ben = await person('desktop', { tamper });
  if (opt.long) await longCall({ app, relay, ...people, check, shot });
  else await steps({ app, relay, ...people, tamper, check, axe, shot, capture: browsers.capture(opt.browser), sfu: Boolean(forwarder) });
} catch (err) {
  check('the run finished', false, err.stack ?? String(err));
  for (const [name, p] of Object.entries(people)) await shot(p.page, `failed-${name}`).catch(() => {});
  if (relay && opt.shots) fs.writeFileSync(path.join(opt.shots, 'turn.log'), relay.log());
  if (forwarder && opt.shots) fs.writeFileSync(path.join(opt.shots, 'sfu.log'), forwarder.log());
  for (const [name, p] of Object.entries(people)) {
    const logs = await p.page.evaluate(() => window.__pcs.map((pc) => pc.__log)).catch(() => []);
    if (opt.shots) fs.writeFileSync(path.join(opt.shots, `${opt.browser}-pc-${name}.log`), logs.map((l, i) => `connection ${i}\n${l.join('\n')}`).join('\n\n'));
  }
} finally {
  await browser.close();
  app.stop();
  relay?.stop();
  forwarder?.stop();
}

const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} of ${results.length} checks failed` : `All ${results.length} checks passed.`);
process.exit(failed ? 1 : 0);
