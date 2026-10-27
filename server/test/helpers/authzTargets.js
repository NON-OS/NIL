import crypto from 'node:crypto';
import wallet from './wallet.js';
import client from './client.js';
import passkeyBody from './passkeyBody.js';
import chat from './chatChannel.js';

const blob = (bytes) => crypto.randomBytes(bytes).toString('base64url');

// The things the matrix's routes point at, made once, and makers for a fresh one wherever a
// call uses its target up (deleting, revoking, pausing). Makers run as the person who owns that
// kind of thing in the matrix, never as the caller being tested, unless the route acts on the
// caller's own things ("own").
export default async function authzTargets(world) {
  const { people, ids } = world;
  const { owner, member, admin } = people;
  const t = {};
  const newTask = async (projectId = ids.shared, who = member, title = 'Shared work') => (await who('POST', '/api/tasks', { title, projectId })).data.task.id;
  const upload = async (taskId, who = member) => (await who('POST', `/api/tasks/${taskId}/attachments`, new TextEncoder().encode('hello'), { 'Content-Type': 'text/plain', 'X-Filename': 'note.txt' })).data.attachment.id;
  const grants = () => ['member', 'admin', 'owner'].map((who) => ({ userId: ids[who], wrappedKey: blob(92) }));
  const newDoc = async () => {
    const id = blob(16);
    await member('POST', '/api/docs', { id, titleCt: blob(40), bodyCt: blob(100), audience: 'team', grants: grants() });
    return id;
  };

  // a task only members may see; its title must never reach a guest or an agent
  t.canary = `Boardroom ${crypto.randomBytes(6).toString('hex')}`;
  t.task = await newTask();
  t.boardTask = await newTask(ids.board, owner, t.canary);
  t.comment = (await member('POST', `/api/tasks/${t.task}/comments`, { body: 'First!' })).data.comment.id;
  t.attachment = await upload(t.task);
  t.label = (await owner('POST', '/api/labels', { name: 'bug' })).data.label.id;
  t.goal = (await owner('POST', '/api/goals', { title: 'Ship it' })).data.goal.id;
  t.doc = await newDoc();
  const newChat = async () => (await chat.makeChannel(member, ids.member, { members: [ids.member, ids.admin, ids.owner] })).data.channel.id;
  t.chat = await newChat();
  const chatEpoch = async () => (await member('GET', `/api/chat/channels/${t.chat}`)).data.channel.epoch;
  t.chatFile = (await member('POST', `/api/chat/channels/${t.chat}/files`, new TextEncoder().encode('ciphertext'), { 'Content-Type': 'application/octet-stream', 'X-Chat-File': chat.chatId() })).data.file.id;
  t.proposal = (await owner('POST', '/api/proposals', { title: 'Lunch?', options: ['Pizza', 'Salad'] })).data.proposal.id;
  t.inviteToken = (await owner('POST', '/api/invites', { role: 'member', reusable: true })).data.token;
  await owner('PUT', '/api/sharing', { shareLinks: true });
  t.shareToken = (await member('POST', '/api/share-links', { kind: 'project', targetId: ids.shared })).data.token;
  t.spareAgent = (await owner('POST', '/api/agents', { name: 'Spare', access: 'read', runner: 'external', projectIds: [ids.shared] })).data.agent.id;
  t.prefix = (await member('GET', '/api/bootstrap')).data.workspace.taskPrefix;
  t.taskKey = `${t.prefix}-${(await member('GET', `/api/tasks/${t.task}/detail`)).data.task.number}`;

  const fresh = {
    task: () => newTask(),
    calendarFile: async () => new URL((await member('POST', '/api/me/calendar-feed')).data.feed.url).pathname.split('/').pop(),
    project: async () => (await owner('POST', '/api/projects', { name: 'Throwaway' })).data.project.id,
    label: async () => (await owner('POST', '/api/labels', { name: `l${blob(4)}` })).data.label.id,
    goal: async () => (await owner('POST', '/api/goals', { title: 'Throwaway' })).data.goal.id,
    invite: async () => (await owner('POST', '/api/invites', { role: 'member' })).data.invite.id,
    comment: async () => (await member('POST', `/api/tasks/${t.task}/comments`, { body: 'Throwaway' })).data.comment.id,
    attachment: () => upload(t.task),
    doc: newDoc,
    chat: newChat,
    proposal: async () => (await owner('POST', '/api/proposals', { title: 'Throwaway', options: ['A', 'B'] })).data.proposal.id,
    shareLink: async () => (await member('POST', '/api/share-links', { kind: 'project', targetId: ids.shared })).data.link.id,
    agent: async () => (await owner('POST', '/api/agents', { name: `Throwaway ${blob(4)}`, access: 'read', runner: 'external' })).data.agent.id,
    // someone an admin removed, ready to be erased for good
    removedUser: async () => {
      const invite = await owner('POST', '/api/invites', { role: 'member' });
      const joiner = client(world.base);
      const id = (await joiner.wallet(wallet(), 'invite', { name: 'Leaver', inviteToken: invite.data.token })).data.user.id;
      await owner('PATCH', `/api/users/${id}`, { deactivated: true });
      return id;
    },
    // an open sign-in reset for the member, issued at once since members need no second admin
    reset: async () => (await admin('POST', `/api/users/${ids.member}/sign-in-reset`, {})).data.reset.id,
    // the caller's own: a personal key, a time entry, a reminder, their wallet, a second wallet, a passkey
    own: {
      chatMessage: async (who) => (await people[who]('POST', `/api/chat/channels/${t.chat}/messages`, chat.message(await chatEpoch(), { ttl: (await member('GET', `/api/chat/channels/${t.chat}`)).data.channel.disappearSeconds }))).data.message.id,
      token: async (who) => (await people[who]('POST', '/api/me/tokens', { name: 'Throwaway' })).data.tokens[0].id,
      time: async (who) => (await people[who]('POST', '/api/time', { startedAt: Date.now() - 120_000, endedAt: Date.now() - 60_000 })).data.entry.id,
      reminder: async (who) => (await people[who]('POST', '/api/reminders', { remindAt: Date.now() + 3_600_000, note: 'Throwaway' })).data.reminder.id,
      mainCredential: async (who) => (await people[who]('GET', '/api/me/credentials')).data.credentials[0].id,
      credential: async (who) => {
        const extra = wallet();
        await people[who].wallet(extra, 'add');
        return (await people[who]('GET', '/api/me/credentials')).data.credentials.find((c) => c.address === extra.address).id;
      },
      passkey: async (who) => {
        const body = passkeyBody();
        return (await people[who]('POST', '/api/me/passkeys', body)).data.passkeys.find((p) => p.credentialId === body.credentialId).id;
      },
    },
  };
  return { ...t, fresh };
}
