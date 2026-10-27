import envNumber from '../lib/envNumber.js';
import envFlag from './envFlag.js';
import configWarning from '../lib/configWarning.js';
import appSite from './appSite.js';

// Calls. Audio, video and screens travel between browsers, encrypted end to end, and never
// through this server: it only passes along each call's handshake and hands out short-lived
// passwords for the TURN relay. Without a relay, browsers would have to reach each other
// directly and so learn each other's IP addresses, which is why calls stay off until one is set
// up, unless an admin allows direct connections.
const env = process.env;
const TURN_URL = /^(turns?|stuns?):(\[[0-9a-f:]+\]|[a-z0-9.-]+)(:\d{1,5})?(\?transport=(udp|tcp))?$/i;

function turnUrls(value) {
  const entries = (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const valid = entries.filter((entry) => TURN_URL.test(entry));
  if (valid.length < entries.length) configWarning('TURN_URLS has entries that aren’t turn:, turns: or stun: addresses. They are skipped.');
  return Object.freeze(valid);
}

function turnSecret(value) {
  const secret = (value ?? '').trim();
  if (!secret) return null;
  if (secret.length < 32) {
    configWarning('TURN_SECRET is shorter than 32 characters, so calls can’t use the relay. Make one with: openssl rand -hex 32');
    return null;
  }
  return secret;
}

const urls = turnUrls(env.TURN_URLS);
const secret = turnSecret(env.TURN_SECRET);
if (urls.length && !secret && !env.TURN_SECRET) configWarning('TURN_URLS is set but TURN_SECRET isn’t. Calls need both to use the relay.');

// Tor carries TCP alone, and a call needs UDP and a path between two browsers, so calls are off
// on an onion address whatever the setting says.
const onion = new URL(appSite.origin).hostname.endsWith('.onion');

export default Object.freeze({
  enabled: envFlag('CALLS', true) && !onion,
  onion,
  turn: Object.freeze({ urls, secret, configured: Boolean(urls.length && secret) }),
  // how long one set of relay passwords works; the app fetches fresh ones well before then
  turnTtlSeconds: envNumber('TURN_TTL_SECONDS', 3600, { min: 60, max: 86_400 }),
  // a mesh: every person sends to every other, so each one more costs everyone upload
  maxPeers: envNumber('CALL_MAX_PEERS', 6, { min: 2, max: 8 }),
  ringSeconds: envNumber('CALL_RING_SECONDS', 45, { min: 3, max: 300 }),
  // how long someone whose connection to the server dropped keeps their place in a call
  rejoinSeconds: envNumber('CALL_REJOIN_SECONDS', 30, { min: 2, max: 300 }),
  // handshake messages one person may send into a call a minute, and how large each may be
  signalsPerMinute: envNumber('CALL_SIGNALS_PER_MINUTE', 240, { min: 30 }),
  maxSignalBytes: envNumber('CALL_SIGNAL_MAX_KB', 24, { min: 8, max: 128 }) * 1024,
  startsPerMinute: envNumber('CALL_STARTS_PER_MINUTE', 6, { min: 1 }),
});
