import keyring from '../../state/keyring';
import socket from '../../realtime/socket';
import callSignal from '../../lib/crypto/callSignal';
import b64u from '../../lib/crypto/b64u';
import keyDirectory from '../keyDirectory';

// Messages between two browsers in a call, sealed on the way out and opened on the way in
// (callSignal), each person's in the order they were sent.
const outgoing = new Map<string, Promise<void>>();
const incoming = new Map<string, Promise<void>>();

function inOrder(queue: Map<string, Promise<void>>, key: string, step: () => Promise<void>) {
  const next = (queue.get(key) ?? Promise.resolve()).then(step).catch(() => {});
  queue.set(key, next);
  void next.then(() => queue.get(key) === next && queue.delete(key));
}

const callSignals = {
  // sealed to the key this browser holds for them; with none, nothing goes, and their side
  // shows they have no keys
  send(callId: string, to: string, message: unknown) {
    inOrder(outgoing, `${callId}\n${to}`, async () => {
      const entry = (await keyDirectory.load()).get(to);
      if (!entry) return;
      const sealed = await callSignal.seal(message, b64u.decode(entry.publicKey));
      socket.call({ type: 'call.signal', callId, to, blob: JSON.stringify(sealed) });
    });
  },

  // `read` gets what the sender said, or { type: 'unreadable' } for a blob that wasn't sealed
  // to this person or was changed on the way
  receive(from: string, blob: string, read: (message: { type?: unknown }) => void) {
    inOrder(incoming, from, async () => {
      const id = keyring.identity();
      if (!id) return;
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(blob);
      } catch {}
      const opened = await callSignal.open(parsed, id);
      read(opened && typeof opened === 'object' ? (opened as { type?: unknown }) : { type: 'unreadable' });
    });
  },

  clear() {
    outgoing.clear();
    incoming.clear();
  },
};

export default callSignals;
