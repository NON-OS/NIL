import crypto from 'node:crypto';
import actors from './authzActors.js';
import chat from './chatChannel.js';

const { MEMBERS, ADMINS } = actors;
const blob = (bytes) => crypto.randomBytes(bytes).toString('base64url');
const channelOf = async ({ world, t }) => (await world.people.member('GET', `/api/chat/channels/${t.chat}`)).data.channel;
const epochOf = async (ctx) => (await channelOf(ctx)).epoch;
const holders = ({ world }) => [world.ids.member, world.ids.admin, world.ids.owner];

// Rows of the authorization matrix for chat. The conversation "chat" is a channel the member
// started with the admin and the owner; guests, agents and removed people are never in one.
export default {
  'GET /api/chat': { allow: MEMBERS },
  'POST /api/chat/channels': { allow: MEMBERS, body: ({ world }, actor) => ({ id: chat.chatId(), kind: 'group', members: holders({ world }), ...chat.roster({ by: world.ids[actor] ?? 'nobody', kind: 'group', members: holders({ world }), managers: holders({ world }) }) }) },
  'GET /api/chat/channels/:id': { allow: MEMBERS, id: 'chat' },
  // the member made it; workspace admins manage channels too
  'PATCH /api/chat/channels/:id': { allow: MEMBERS, id: 'chat', body: { disappearSeconds: 3600 } },
  'DELETE /api/chat/channels/:id': { allow: MEMBERS, id: 'fresh.chat' },
  'POST /api/chat/channels/:id/leave': { allow: MEMBERS, id: 'fresh.chat', body: ({ world }, actor) => ({ statement: chat.statement(world.ids[actor] ?? 'nobody') }) },
  // an admin's signed word that someone removed from the team left every conversation
  'POST /api/chat/removals': { allow: ADMINS, body: ({ world }, actor) => ({ userId: world.ids.outsider, statement: chat.statement(world.ids[actor] ?? 'nobody', world.ids.outsider) }) },
  'GET /api/chat/channels/:id/marks': { allow: MEMBERS, id: 'chat' },
  'PUT /api/chat/channels/:id/marks/:stream': {
    allow: MEMBERS,
    id: 'chat',
    stream: () => blob(12),
    body: async (ctx) => ({ epoch: await epochOf(ctx), sentAt: Date.now(), bodyCt: blob(100) }),
  },
  'PUT /api/chat/channels/:id/read': { allow: MEMBERS, id: 'chat', body: { seq: 0 } },
  'PUT /api/chat/channels/:id/notify': { allow: MEMBERS, id: 'chat', body: { notify: 'all' } },
  'GET /api/chat/channels/:id/epochs': { allow: MEMBERS, id: 'chat' },
  // a new key for the same people, which anyone in the conversation may start
  'POST /api/chat/channels/:id/epochs': {
    allow: MEMBERS,
    id: 'chat',
    body: async (ctx, actor) => ({ epoch: (await epochOf(ctx)) + 1, ...chat.roster({ by: ctx.world.ids[actor] ?? 'nobody', members: holders(ctx), managers: [ctx.world.ids.member] }) }),
  },
  'POST /api/chat/channels/:id/grants': { allow: MEMBERS, id: 'chat', body: ({ world }) => ({ epoch: 1, grants: [{ userId: world.ids.member, wrappedKey: blob(92) }] }) },
  'GET /api/chat/channels/:id/messages': { allow: MEMBERS, id: 'chat' },
  'POST /api/chat/channels/:id/messages': {
    allow: MEMBERS,
    id: 'chat',
    body: async (ctx) => {
      const { epoch, disappearSeconds } = await channelOf(ctx);
      return chat.message(epoch, { ttl: disappearSeconds });
    },
  },
  // only whoever sent a message edits it
  'PUT /api/chat/messages/:id': { allow: MEMBERS, id: 'own.chatMessage', body: async (ctx) => ({ epoch: await epochOf(ctx), bodyCt: blob(100), edits: 1 }) },
  'POST /api/chat/channels/:id/files': {
    allow: MEMBERS,
    id: 'chat',
    raw: 'ciphertext',
    get headers() {
      return { 'Content-Type': 'application/octet-stream', 'X-Chat-File': chat.chatId() };
    },
  },
  'GET /api/chat/files/:id': { allow: MEMBERS, id: 'chatFile' },
};
