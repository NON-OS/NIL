import http from '../../api/http';
import chatState from '../../state/chatState';

let timer: number | undefined;
let pending: { channelId: string; seq: number } | null = null;

// Marks a conversation read up to `seq`, a moment after it shows, so scrolling through doesn't
// send a request per message. Your other tabs and devices hear it from the server.
const chatRead = {
  mark(channelId: string, seq: number) {
    const channel = chatState.get().channels[channelId];
    if (!channel || seq <= channel.readSeq) return;
    chatState.set((s) => ({ channels: { ...s.channels, [channelId]: { ...channel, readSeq: seq, unread: 0 } } }));
    if (pending && pending.channelId !== channelId) void chatRead.send();
    pending = { channelId, seq };
    clearTimeout(timer);
    timer = window.setTimeout(() => void chatRead.send(), 600);
  },

  async send() {
    const p = pending;
    pending = null;
    if (p) await http.put(`/chat/channels/${p.channelId}/read`, { seq: p.seq }).catch(() => {});
  },
};

export default chatRead;
