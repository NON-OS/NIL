import config from '../config.js';
import subscriptions from '../push/subscriptions.js';
import sendPush from '../push/sendPush.js';
import log from '../lib/log.js';

// A ring on the person's phones and other browsers, through Web Push. It never names anyone:
// lock screens show it to whoever is nearby, and the push service is somebody else's. The tag
// is the call's, so "Missed call" replaces "Incoming call" on the same device.
async function deliver(userId, callId, missed) {
  const message = missed ? { title: 'Missed call', body: 'Open Nil to call back.', tag: `nil-call-${callId}` } : { title: 'Incoming call', body: 'Open Nil to answer.', tag: `nil-call-${callId}`, call: callId };
  await Promise.all(
    subscriptions.of(userId).map(async (device) => {
      const result = await sendPush(device, message, { urgency: 'high', ttlSeconds: config.calls.ringSeconds });
      if (result === 'gone') subscriptions.drop(device.id);
    }),
  );
}

export default function callRing(userId, callId, { missed = false } = {}) {
  if (!config.push.enabled) return;
  setImmediate(() => deliver(userId, callId, missed).catch((err) => log.error('push', 'could not ring a device', err.message)));
}
