import store from '../state/store';
import applyEvent from './applyEvent';

let ws: WebSocket | null = null;
let retry = 0;
let timer: number | undefined;
let wanted = false;
let viewing: string | null = null;
let onReconnect: (() => void) | null = null;

function send(payload: unknown) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function open() {
  clearTimeout(timer);
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const socket = new WebSocket(url);
  ws = socket;

  socket.onopen = () => {
    const wasRetrying = retry > 0;
    retry = 0;
    store.set({ connected: true });
    send({ type: 'presence', viewing });
    if (wasRetrying) onReconnect?.();
  };
  socket.onmessage = (e) => {
    try {
      applyEvent(JSON.parse(e.data));
    } catch {}
  };
  socket.onclose = () => {
    if (ws !== socket) return;
    store.set({ connected: false });
    ws = null;
    if (!wanted) return;
    // back off 1s, 2s, 4s… up to 20s, with jitter so a server restart isn't stampeded
    const delay = Math.min(20_000, 1000 * 2 ** retry++) * (0.75 + Math.random() / 2);
    timer = window.setTimeout(open, delay);
  };
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wanted && !ws) open();
});

// back on a network: reconnect now rather than at the end of the current pause
window.addEventListener('online', () => {
  if (wanted && !ws) open();
});

const socket = {
  connect(reconnectHandler: () => void) {
    onReconnect = reconnectHandler;
    wanted = true;
    if (!ws) open();
  },

  disconnect() {
    wanted = false;
    clearTimeout(timer);
    ws?.close();
    ws = null;
  },

  viewing(taskId: string | null) {
    viewing = taskId;
    send({ type: 'presence', viewing });
  },

  typing(taskId: string) {
    send({ type: 'typing', taskId });
  },

  // a call's join, leave and handshake messages (actions/calls)
  call(payload: { type: string; callId: string; [key: string]: unknown }) {
    send(payload);
  },
};

export default socket;
