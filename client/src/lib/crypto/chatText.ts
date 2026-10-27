import { utf8ToBytes } from '@noble/hashes/utils';
import aesGcm from './aesGcm';
import b64u from './b64u';

export interface ChatPlace {
  workspaceKey: string;
  channelId: string;
  epoch: number;
  // a message's own id, sender and send time; null for the conversation's name and topic
  message: { id: string; senderId: string; sentAt: number } | null;
}

// Which workspace, conversation, epoch and message a ciphertext is, as its additional data: the
// server can't move a message to another conversation, pass it off under another id, sender or
// time, or show it under another epoch's number.
const place = ({ workspaceKey, channelId, epoch, message }: ChatPlace) =>
  `nil/chat/${workspaceKey}/${channelId}/e${epoch}/${message ? `${message.id}/${message.senderId}/${message.sentAt}` : 'meta'}`;

// Encrypts and decrypts a message, or a conversation's name and topic, with an epoch's key.
const chatText = {
  context: place,

  async seal(key: Uint8Array, at: ChatPlace, payload: string) {
    return b64u.encode(await aesGcm.seal(key, new TextEncoder().encode(payload), utf8ToBytes(place(at))));
  },

  async open(key: Uint8Array, at: ChatPlace, blob: string) {
    return new TextDecoder().decode(await aesGcm.open(key, b64u.decode(blob), utf8ToBytes(place(at))));
  },
};

export default chatText;
