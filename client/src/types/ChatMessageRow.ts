// One message, reaction or tombstone as the server stores it: ciphertext plus what orders it.
export default interface ChatMessageRow {
  id: string;
  channelId: string;
  seq: number;
  threadId: string | null;
  kind: 'message' | 'reaction';
  senderId: string | null;
  epoch: number;
  sentAt: number;
  bodyCt: string;
  edits: number;
  deleted: boolean;
  replies: number;
  lastReplyAt: number | null;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
}
