import config from '../config.js';
import logLimited from '../lib/logLimited.js';
import sfuToken from './sfuToken.js';

const TIMEOUT_MS = 5000;

// Tells the SFU to drop someone who left a call, or a whole room once the call ends, so nobody
// lingers there. Their keys are replaced anyway the moment they leave; this stops the SFU from
// forwarding them anything at all. Best effort: an SFU that's away gets on without it.
async function twirp(method, callId, body) {
  const { url, apiUrl } = config.calls.sfu;
  const base = apiUrl ?? url.replace(/^ws/, 'http');
  try {
    const res = await fetch(`${base}/twirp/livekit.RoomService/${method}`, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Authorization: `Bearer ${sfuToken({ callId, admin: true }).token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    await res.body?.cancel().catch(() => {});
  } catch (err) {
    logLimited('calls:sfu', 'warn', 'calls', 'The SFU couldn’t be reached to drop someone from a call.', err);
  }
}

const sfuRooms = {
  remove(callId, userId, session) {
    if (!config.calls.sfu) return;
    const { room, identity } = sfuToken({ callId, userId, session });
    void twirp('RemoveParticipant', callId, { room, identity });
  },

  close(callId) {
    if (!config.calls.sfu) return;
    void twirp('DeleteRoom', callId, { room: sfuToken({ callId }).room });
  },
};

export default sfuRooms;
