import type ChatFile from './ChatFile';

// A message, reaction or deleted message as this browser shows it, once opened and checked.
export default interface ChatItem {
  id: string;
  channelId: string;
  // the server's order; 0 for one still waiting in this tab to be sent
  seq: number;
  threadId: string | null;
  senderId: string | null;
  sentAt: number;
  epoch: number;
  type: 'message' | 'reaction' | 'deleted';
  text: string;
  files: ChatFile[];
  mentions: string[];
  // a reaction's emoji and the message it's on
  emoji: string | null;
  target: string | null;
  edit: number;
  editedAt: number | null;
  replies: number;
  lastReplyAt: number | null;
  expiresAt: number | null;
  stream: string;
  n: number;
  // 'locked': no key here for its epoch yet. 'unverified': it didn't decrypt or its signature,
  // signer or key didn't check out, so its words aren't shown.
  state: 'ok' | 'locked' | 'unverified';
  // set while it waits in this tab: queued offline, on its way, or refused
  pending?: 'queued' | 'sending' | 'failed';
  error?: string;
}
