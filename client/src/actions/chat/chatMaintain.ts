import http from '../../api/http';
import store from '../../state/store';
import chatKeyring from '../../state/chatKeyring';
import keyDirectory from '../keyDirectory';
import chatKeys from './chatKeys';
import chatRosters from './chatRosters';
import startEpoch from './startEpoch';
import departureCounts from './departureCounts';
import type ChatChannelRow from '../../types/ChatChannelRow';

// how many earlier epochs a newcomer is handed, so they can read back
const HISTORY = 50;
// the longest any key is used before a new one starts, whatever the server says
const MAX_EPOCH_MS = 7 * 86_400_000;

const same = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));
// Hands the keys of earlier epochs this person holds to people who just joined, up to what a
// forward-secret conversation still keeps.
async function handHistory(channel: ChatChannelRow, newcomers: string[]) {
  if (!newcomers.length) return;
  const chain = await chatRosters.load(channel);
  for (let epoch = Math.max(1, channel.purgedEpoch + 1, channel.epoch - HISTORY + 1); epoch <= channel.epoch; epoch++) {
    const key = await chatKeys.get(channel, chain, epoch).catch(() => null);
    if (!key) continue;
    const grants = (await chatKeys.seal(key, newcomers)).filter((g) => newcomers.includes(g.userId));
    if (grants.length) await http.post(`/chat/channels/${channel.id}/grants`, { epoch, grants }).catch(() => {});
  }
}

// Keeps a conversation's key where it belongs, starting a new epoch when:
// - someone who holds the key is out, and their signed departure (their own leaving, or an
//   admin's removal from the team) can be cited, so any member may do it;
// - someone should get the key: in a team channel any member brings in a teammate whose key
//   they confirmed, anywhere else only an explicit change by whoever manages it;
// - someone's key was replaced, or the epoch is due on schedule.
// Nothing changes on the server's say alone: without a signed departure, nobody is left out unless
// a manager asks for it with `members`, or manages a team channel, whose people are the team's;
// and in a private conversation nobody comes in that way either. Only ever for people whose keys this person confirmed: if anyone who holds the key now
// can't be sealed to, nothing changes and the key notice asks to check them. True when a new
// epoch started.
export default async function chatMaintain(channel: ChatChannelRow, { members }: { members?: string[] } = {}) {
  const me = store.get().me!.id;
  const chain = await chatRosters.load(channel);
  const head = chain.rosters[chain.rosters.length - 1];
  if (chain.broken !== null || !head || !head.members.includes(me) || head.epoch !== channel.epoch) return false;
  const wanted = members ?? channel.members;
  const manager = head.managers.includes(me);
  // due by the signed list's own time, so a server that holds back its clock can't keep a key on
  // past the schedule; it may ask for sooner, never later than a week
  const every = Math.min(channel.rotateAt !== null && channel.epochAt !== null ? channel.rotateAt - channel.epochAt : MAX_EPOCH_MS, MAX_EPOCH_MS);
  const due = Date.now() > head.at + every;
  // a copy of the current key that doesn't open to the one the list names is a member's doing;
  // a new key from here, sealed by this browser, mends it
  const mended = await chatKeys.get(channel, chain, channel.epoch).then(() => false, () => true);
  if (!members && !due && !mended && same(head.members, wanted) && same(head.members, channel.keyHolders)) return false;
  // the cached directory is enough to decide; sealing looks again, fresh
  const keys = await keyDirectory.load();
  const sealable = new Set(wanted.filter((id) => keys.get(id)?.active && keys.get(id)?.state === 'confirmed'));
  const removing = head.members.filter((id) => !wanted.includes(id));
  // a departure the server hands over counts only once its signature and signer check out here
  const proofs: (string | null)[] = [];
  for (const id of removing) {
    const raw = channel.departures.find((d) => d.userId === id)?.statement ?? null;
    proofs.push(raw && (await departureCounts([raw], channel.id, id, chain.rosters, { admins: manager })) ? raw : null);
  }
  // in a team channel, who is on the team is the workspace's to say, so whoever manages it leaves
  // out anyone no longer on it; anywhere else that takes their own say
  if (proofs.includes(null) && !(manager && (members || channel.audience === 'team'))) return false;
  const joining = wanted.filter((id) => id !== me && sealable.has(id) && !head.members.includes(id));
  const adding = members || channel.audience === 'team' ? joining : [];
  const next = [...head.members.filter((id) => wanted.includes(id)), ...adding];
  if (next.some((id) => id !== me && !sealable.has(id))) return false;
  const keyless = next.some((id) => !channel.keyHolders.includes(id));
  if (!removing.length && !adding.length && !keyless && !due && !mended && !members) return false;
  if (members && channel.audience === 'people' && !manager) throw new Error('Only whoever manages this conversation can change who is in it.');
  // who manages a channel carries over: never from what the server says about anyone's role
  const managers = channel.kind === 'channel' ? head.managers.filter((id) => next.includes(id)) : next;
  const epoch = channel.epoch + 1;
  const made = await startEpoch(channel, epoch, head, { members: next, managers });
  const cited = proofs.filter((p): p is string => p !== null);
  await http.post(`/chat/channels/${channel.id}/epochs`, { epoch, roster: made.raw, grants: made.grants, proofs: cited, ...(members && channel.audience === 'people' ? { members: wanted } : {}) });
  chatKeyring.put(channel.id, epoch, made.key);
  await chatRosters.add(channel, { ...made.roster, departed: removing.filter((id, i) => proofs[i] !== null) });
  await handHistory(channel, made.roster.members.filter((id) => adding.includes(id)));
  return true;
}
