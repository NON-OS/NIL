import envNumber from '../lib/envNumber.js';
import callsEnabled from './callsEnabled.js';
import configWarning from '../lib/configWarning.js';

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

// The SFU that carries bigger calls (LiveKit), as browsers reach it, and the key pair Nil signs
// their room tokens with. It forwards frames encrypted in the browsers and never holds a key.
function sfu() {
  const url = (env.SFU_URL ?? '').trim();
  const key = (env.SFU_API_KEY ?? '').trim();
  const secret = (env.SFU_API_SECRET ?? '').trim();
  if (!url && !key && !secret) return null;
  if (!/^wss:\/\/[a-z0-9.-]+(:\d{1,5})?\/?$/i.test(url) && !/^ws:\/\/(localhost|127\.0\.0\.1|\d{1,3}(\.\d{1,3}){3})(:\d{1,5})?\/?$/i.test(url)) {
    configWarning('SFU_URL must be a wss:// address (ws:// only on this machine). Calls stay browser to browser.');
    return null;
  }
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(key) || secret.length < 32) {
    configWarning('SFU_API_KEY and SFU_API_SECRET (at least 32 characters) are both needed for the SFU. Calls stay browser to browser.');
    return null;
  }
  return Object.freeze({ url: url.replace(/\/$/, ''), key, secret });
}

const urls = turnUrls(env.TURN_URLS);
// STUN for direct connections when there's no relay to answer it; a STUN server sees the IP
// address of everyone who asks, so pick one you trust
const stunUrls = Object.freeze(turnUrls(env.STUN_URLS).filter((u) => u.startsWith('stun')));
const secret = turnSecret(env.TURN_SECRET);
if (urls.length && !secret && !env.TURN_SECRET) configWarning('TURN_URLS is set but TURN_SECRET isn’t. Calls need both to use the relay.');

export default Object.freeze({
  enabled: callsEnabled.enabled,
  onion: callsEnabled.onion,
  turn: Object.freeze({ urls, secret, configured: Boolean(urls.length && secret) }),
  stunUrls,
  // how long one set of relay passwords works; the app fetches fresh ones well before then
  turnTtlSeconds: envNumber('TURN_TTL_SECONDS', 600, { min: 60, max: 86_400 }),
  // a mesh: every person sends to every other, so each one more costs everyone upload
  maxPeers: envNumber('CALL_MAX_PEERS', 6, { min: 2, max: 8 }),
  // with an SFU: calls of more than CALL_MESH_MAX_PEERS move to it, up to CALL_SFU_MAX_PEERS
  sfu: sfu(),
  meshMaxPeers: envNumber('CALL_MESH_MAX_PEERS', 4, { min: 2, max: 8 }),
  sfuMaxPeers: envNumber('CALL_SFU_MAX_PEERS', 50, { min: 3, max: 200 }),
  ringSeconds: envNumber('CALL_RING_SECONDS', 45, { min: 3, max: 300 }),
  // how long someone whose connection to the server dropped keeps their place in a call
  rejoinSeconds: envNumber('CALL_REJOIN_SECONDS', 30, { min: 2, max: 300 }),
  // handshake messages one person may send into a call a minute, and how large each may be
  signalsPerMinute: envNumber('CALL_SIGNALS_PER_MINUTE', 240, { min: 30 }),
  maxSignalBytes: envNumber('CALL_SIGNAL_MAX_KB', 24, { min: 8, max: 128 }) * 1024,
  startsPerMinute: envNumber('CALL_STARTS_PER_MINUTE', 6, { min: 1 }),
  // how long a call's record outlives the last sign of anyone in it, server restarts included
  recordHours: envNumber('CALL_RECORD_HOURS', 12, { min: 1, max: 168 }),
});
