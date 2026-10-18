import crypto from 'node:crypto';
import { Group } from '@semaphore-protocol/group';
import { generateProof } from '@semaphore-protocol/proof';

const ZK = new URL('../../../client/public/zk/', import.meta.url).pathname;
const field = (text) => BigInt(`0x${crypto.createHash('sha256').update(text).digest('hex').slice(0, 62)}`).toString();

// What a member's browser does to send an AI request anonymously, worked out from public values
// only: the scope from the workspace key, the UTC day and a slot; the message from the exact
// request text; the proof against the member list the server handed out. `send` posts it with
// no cookie, as the browser does.
export default function aiCredit(base, workspaceKey, depth = 16) {
  const artifacts = { wasm: `${ZK}semaphore-${depth}.wasm`, zkey: `${ZK}semaphore-${depth}.zkey` };
  const credit = {
    day: (now = Date.now()) => new Date(now).toISOString().slice(0, 10),
    scope: (day, slot, key = workspaceKey) => field(`nil/ai-credit/v1|scope|${key}|${day}|${slot}`),
    message: (feature, payload) => field(`nil/ai-credit/v1|message|${feature}|${payload}`),
    group(members) {
      const g = new Group();
      for (const c of members) g.addMember(BigInt(c));
      return g;
    },
    // a proof for `feature` with `body`; `sign` overrides what the proof itself commits to
    async request(identity, members, feature, body, { day = credit.day(), slot = 0, sign = {} } = {}) {
      const payload = JSON.stringify(body);
      const proof = await generateProof(identity, credit.group(members), sign.message ?? credit.message(sign.feature ?? feature, payload), sign.scope ?? credit.scope(day, slot), depth, artifacts);
      return { day, slot, payload, proof };
    },
    async send(feature, request, headers = {}) {
      const res = await fetch(`${base()}/api/ai-credits/${feature}`, { method: 'POST', headers: { 'X-NONOS': '1', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(request) });
      return { status: res.status, data: await res.json() };
    },
  };
  return credit;
}
