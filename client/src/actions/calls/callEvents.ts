import callStore from '../../state/callStore';
import ringNotice from './ringNotice';
import type CallView from '../../types/CallView';

// the connection code loads the first time a call needs it, not with the app
let loading: Promise<typeof import('./callSession').default> | null = null;
const engine = () => (loading ??= import('./callSession').then((m) => m.default));

const isView = (v: any): v is CallView => typeof v?.id === 'string' && Array.isArray(v.members) && Array.isArray(v.ringing) && (v.kind === 'person' || v.kind === 'project');
const inCall = (callId: unknown) => callStore.get().active?.id === callId;

function put(call: CallView) {
  callStore.set((s) => ({ live: { ...s.live, [call.id]: call } }));
}

function forget(callId: string) {
  ringNotice.stop(callId);
  callStore.set((s) => ({ live: Object.fromEntries(Object.entries(s.live).filter(([id]) => id !== callId)), ringing: s.ringing.filter((id) => id !== callId) }));
}

// The server's call messages on the live connection. Who is in which call goes to the store;
// the handshake goes to the connection code, in the order it came.
export default function callEvents(event: any) {
  switch (event.type) {
    case 'call.update':
      if (!isView(event.call)) return;
      put(event.call);
      if (inCall(event.call.id)) void engine().then((s) => s.update(event.call));
      break;
    case 'call.ring':
      if (!isView(event.call) || inCall(event.call.id)) return;
      put(event.call);
      callStore.set((s) => ({ ringing: s.ringing.includes(event.call.id) ? s.ringing : [...s.ringing, event.call.id] }));
      ringNotice.start(event.call.id);
      break;
    case 'call.ring.end':
      ringNotice.stop(event.callId);
      callStore.set((s) => ({ ringing: s.ringing.filter((id) => id !== event.callId) }));
      break;
    case 'call.end':
      forget(event.callId);
      if (inCall(event.callId)) void engine().then((s) => s.end('The call ended.'));
      break;
    case 'call.joined':
      if (!isView(event.call)) return;
      put(event.call);
      void engine().then((s) => s.joined(event.call));
      break;
    case 'call.refused':
      void engine().then((s) => s.refused(event.callId, event.reason));
      break;
    case 'call.signal':
      if (inCall(event.callId) && typeof event.from === 'string') void engine().then((s) => s.signal(event.callId, event.from, event.blob));
      break;
    case 'call.declined':
      if (inCall(event.callId)) void engine().then((s) => s.declined(event.callId, event.userId));
      break;
    case 'call.replaced':
      void engine().then((s) => s.replaced(event.callId));
      break;
  }
}
