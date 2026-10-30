import crypto from 'node:crypto';

// A workspace's secret for the relay, made from the operator's CLOUD_TURN_SECRET and the
// workspace's id: nothing to store, a different one for every workspace, and all of them new when
// CLOUD_TURN_SECRET changes.
export default function workspaceSecret(secret, id) {
  return crypto.createHmac('sha256', secret).update(`nil/turn-workspace/v1\n${id}`).digest('hex');
}
