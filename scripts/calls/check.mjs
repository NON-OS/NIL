// Calls in real browsers: three people in Chromium with fake cameras and microphones, through a
// real coturn on this machine (scripts/calls/turn.mjs). It checks that calls connect through
// the relay and nowhere else, survive the relay going away and coming back (ICE restart), that
// a server swapping a fingerprint is refused, that a three-way project call works, and runs axe
// on the call screen at desktop and phone sizes. Needs `npm run build` first.
//
//   node scripts/calls/check.mjs [--shots <dir>]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import AxeBuilder from '@axe-core/playwright';
import turn from './turn.mjs';
import steps from './steps.mjs';

const { values: opt } = parseArgs({ options: { shots: { type: 'string' }, port: { type: 'string', default: process.env.CALLS_PORT ?? '3991' } } });
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

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--auto-accept-this-tab-capture', '--auto-select-desktop-capture-source=Entire screen'],
});
const relay = turn();
if (!relay) console.log('coturn is not installed here; calls are checked with direct connections only.');
await relay?.start();
const app = await world({ port: Number(opt.port), env: relay ? { TURN_URLS: relay.url, TURN_SECRET: relay.secret, TURN_TTL_SECONDS: '600' } : {} });
if (opt.shots) fs.mkdirSync(opt.shots, { recursive: true });

async function person(size, { tamper } = {}) {
  const context = await browser.newContext({ ...SIZES[size], colorScheme: 'light', permissions: ['camera', 'microphone'] });
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
  page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.error(`${size}: console ${m.type()}: ${m.text().slice(0, 300)}`));
  if (tamper) {
    // a dishonest server: it swaps one byte of the certificate fingerprint in every session
    // description it passes this browser, while `tamper.on` is set
    await page.routeWebSocket('**/ws', (ws) => {
      const server = ws.connectToServer();
      ws.onMessage((m) => server.send(m));
      server.onMessage((m) => {
        if (!tamper.on || typeof m !== 'string' || !m.includes('"call.signal"')) return ws.send(m);
        const event = JSON.parse(m);
        const blob = JSON.parse(event.blob);
        if (typeof blob.sdp === 'string') {
          blob.sdp = blob.sdp.replace(/a=fingerprint:sha-256 ([0-9A-F]{2})/g, (all, first) => all.replace(first, first === 'AA' ? 'BB' : 'AA'));
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
  if (opt.shots) await page.screenshot({ path: path.join(opt.shots, `${name}.png`) });
}

const tamper = { on: false, hits: 0 };
const people = {};
try {
  people.ada = await person('desktop');
  people.ana = await person('phone');
  people.ben = await person('desktop', { tamper });
  await steps({ app, relay, ...people, tamper, check, axe, shot });
} catch (err) {
  check('the run finished', false, err.stack ?? String(err));
  for (const [name, p] of Object.entries(people)) await shot(p.page, `failed-${name}`).catch(() => {});
  if (relay && opt.shots) fs.writeFileSync(path.join(opt.shots, 'turn.log'), relay.log());
  for (const [name, p] of Object.entries(people)) {
    const logs = await p.page.evaluate(() => window.__pcs.map((pc) => pc.__log)).catch(() => []);
    if (opt.shots) fs.writeFileSync(path.join(opt.shots, `pc-${name}.log`), logs.map((l, i) => `connection ${i}\n${l.join('\n')}`).join('\n\n'));
  }
} finally {
  await browser.close();
  app.stop();
  relay?.stop();
}

const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} of ${results.length} checks failed` : `All ${results.length} checks passed.`);
process.exit(failed ? 1 : 0);
