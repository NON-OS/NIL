import envNumber from '../lib/envNumber.js';
import configWarning from '../lib/configWarning.js';
import appSite from './appSite.js';

// Web Push. A notification travels through the push service of the browser's maker, encrypted
// so only the person's device can read it. The server only ever posts to the hosts listed here,
// so a subscription can't point it at an arbitrary address. "*." allows any subdomain.
const PUSH_SERVICES = 'fcm.googleapis.com,android.googleapis.com,updates.push.services.mozilla.com,web.push.apple.com,*.notify.windows.com';
const HOST_PATTERN = /^(\*\.)?[a-z0-9-]+(\.[a-z0-9-]+)+$/;

function pushServices(value) {
  const entries = (value || PUSH_SERVICES).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const valid = entries.filter((entry) => HOST_PATTERN.test(entry));
  if (valid.length < entries.length) configWarning('PUSH_SERVICES has entries that aren’t host names. They are skipped.');
  return Object.freeze(valid);
}

// Push services may contact whoever runs a server that misbehaves. A mailto: or https: address works.
function pushSubject(value, appUrl) {
  if (value) {
    if (/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(value)) return value;
    configWarning('VAPID_SUBJECT must be a mailto: or https: address. It is left out of push requests.');
    return null;
  }
  return appUrl?.startsWith('https://') ? appUrl : null;
}

const env = process.env;

export default Object.freeze({
  enabled: env.PUSH_NOTIFICATIONS !== 'off',
  // base64url, as web-push tools print them: the 65-byte public point and the 32-byte private key
  publicKey: env.VAPID_PUBLIC_KEY || null,
  privateKey: env.VAPID_PRIVATE_KEY || null,
  subject: pushSubject(env.VAPID_SUBJECT, appSite.origin),
  services: pushServices(env.PUSH_SERVICES),
  ttlHours: envNumber('PUSH_TTL_HOURS', 24, { max: 672 }),
});
