import http from '../../api/http';
import store from '../../state/store';
import chatKeyring from '../../state/chatKeyring';
import isAdmin from '../../lib/isAdmin';
import keyDirectory from '../keyDirectory';
import chatKeys from './chatKeys';
import chatRosters from './chatRosters';
import startEpoch from './startEpoch';
import type ChatChannelRow from '../../types/ChatChannelRow';

// how many earlier epochs a newcomer is handed, so they can read back
const HISTORY = 50;

const managersFor = (channel: ChatChannelRow, members: string[]) => {
  const users = store.get().users;
  return members.filter((id) => id === channel.createdBy || isAdmin(users[id]));
};

// Hands the keys of earlier epochs this person holds to people who just joined.
async function handHistory(channel: ChatChannelRow, newcomers: string[]) {
  if (!newcomers.length) return;
  const chain = await chatRosters.load(channel);
  for (let epoch = Math.max(1, channel.epoch - HISTORY + 1); epoch <= channel.epoch; epoch++) {
    const key = await chatKeys.get(channel, chain, epoch).catch(() => null);
    if (!key) continue;
    const grants = (await chatKeys.seal(key, newcomers)).filter((g) => newcomers.includes(g.userId));
    if (grants.length) await http.post(`/chat/channels/${channel.id}/grants`, { epoch, grants }).catch(() => {});
  }
}

// Keeps a conversation's key where it belongs. Starts a new epoch when someone the server no
// longer lists still holds the key (only a manager may), when someone listed should get it
// (a manager, or anyone in a team channel), when someone's key was replaced, or when the epoch
// is due on schedule. Only ever for people whose keys this person has confirmed: if anyone who
// holds the key now can't be sealed to, nothing changes and the key notice asks them to check.
// `members` asks for a change of who is in it (adding or taking people out). True when a new
// epoch started.
export default async function chatMaintain(channel: ChatChannelRow, { members }: { members?: string[] } = {}) {
  const me = store.get().me!.id;
  const chain = await chatRosters.load(channel);
  const head = chain.rosters[chain.rosters.length - 1];
  if (chain.broken !== null || !head || !head.members.includes(me) || head.epoch !== channel.epoch) return false;
  const wanted = members ?? channel.members;
  const sealable = await keyDirectory.sharable(wanted);
  const next = wanted.filter((id) => id === me || sealable.has(id));
  const manager = head.managers.includes(me);
  const removing = head.members.filter((id) => !wanted.includes(id));
  const adding = next.filter((id) => !head.members.includes(id));
  const stuck = head.members.some((id) => wanted.includes(id) && !next.includes(id));
  const keyless = head.members.some((id) => wanted.includes(id) && !channel.keyHolders.includes(id));
  const due = channel.rotateAt !== null && Date.now() > channel.rotateAt;
  if (stuck || (!removing.length && !adding.length && !keyless && !due && !members)) return false;
  if ((removing.length || (members && channel.audience === 'people')) && !manager) throw new Error('Only whoever manages this conversation can change who is in it.');
  if (adding.length && !manager && channel.audience !== 'team') return false;
  const managers = channel.kind === 'channel' ? (manager ? managersFor(channel, next) : head.managers) : next;
  const epoch = channel.epoch + 1;
  const made = await startEpoch(channel, epoch, head, { members: next, managers });
  await http.post(`/chat/channels/${channel.id}/epochs`, { epoch, roster: made.raw, grants: made.grants, ...(members && channel.audience === 'people' ? { members: wanted } : {}) });
  chatKeyring.put(channel.id, epoch, made.key);
  await chatRosters.add(channel, made.roster);
  await handHistory(channel, made.roster.members.filter((id) => adding.includes(id)));
  return true;
}
