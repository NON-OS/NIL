// Something this browser noticed about what the server sent for a conversation.
export default interface ChatNotice {
  kind: 'missing' | 'replayed' | 'reordered' | 'roster' | 'rollback';
  senderId: string | null;
  count: number;
}
