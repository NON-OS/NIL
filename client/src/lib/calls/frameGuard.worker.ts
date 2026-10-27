import 'livekit-client/e2ee-worker';
import frameFooter from './frameFooter';
import frameSender from './frameSender';
import frameLedger from './frameLedger';

// LiveKit's frame encryption worker, with Nil's own step on either side of it. Going out, after
// LiveKit encrypts a frame: a signed list of the frames sent (frameSender) and padding. Coming
// in, before LiveKit decrypts one: the footer comes off, and a frame no list of its sender names
// is counted (frameLedger); once a sender has too many, their frames stop and the page is told.
// Frames reach LiveKit's worker exactly as before, so its encryption is unchanged.

interface Frame {
  data: ArrayBuffer;
  type?: string;
  getMetadata?: () => { synchronizationSource?: number };
}
interface Transformer {
  readable: ReadableStream<Frame>;
  writable: WritableStream<Frame>;
  options: { kind: string; participantIdentity: string; trackId: string };
}
interface Scope {
  onmessage: ((ev: { data: { kind: string; data: Record<string, unknown> } }) => void) | null;
  onrtctransform?: ((ev: { transformer: Transformer }) => void) | null;
  postMessage(message: unknown): void;
}

const scope = self as unknown as Scope;
const theirMessage = scope.onmessage;
const theirTransform = scope.onrtctransform;
const ledger = frameLedger();
let signer: { identity: string; secret: Uint8Array } | null = null;
// lists from a track sent again later start higher than any it sent before: tenths of a
// second since 2026 outgrow the five lists a second a track sends
const counterStart = () => Math.floor((Date.now() - Date.UTC(2026, 0, 1)) / 100);

function outgoing() {
  let sender: ReturnType<typeof frameSender> | null = null;
  return new TransformStream<Frame, Frame>({
    transform(frame, out) {
      // nothing goes out unsigned
      if (!signer) return;
      sender ??= frameSender(signer.identity, signer.secret, counterStart());
      const layer = frame.getMetadata?.().synchronizationSource ?? 0;
      frame.data = sender.out(new Uint8Array(frame.data), layer, frame.type === undefined, Date.now()).buffer as ArrayBuffer;
      out.enqueue(frame);
    },
  });
}

function incoming(identity: string, trackId: string) {
  return new TransformStream<Frame, Frame>({
    transform(frame, out) {
      const now = Date.now();
      const opened = frameFooter.unwrap(new Uint8Array(frame.data));
      if (!opened) return void ledger.unwrapped(identity, now);
      if (!ledger.frame(identity, trackId, opened.frame, opened.list, now)) return;
      frame.data = opened.frame.slice().buffer as ArrayBuffer;
      out.enqueue(frame);
    },
  });
}

// the streams LiveKit gets in place of the browser's own: ours sits between them
function wrap(kind: string, readable: ReadableStream<Frame>, writable: WritableStream<Frame>, identity: string, trackId: string) {
  if (kind === 'encode') {
    const middle = new TransformStream<Frame, Frame>();
    void middle.readable.pipeThrough(outgoing()).pipeTo(writable).catch(() => {});
    return { readable, writable: middle.writable };
  }
  return { readable: readable.pipeThrough(incoming(identity, trackId)), writable };
}

scope.onmessage = (ev) => {
  const { kind, data } = ev.data;
  if (kind === 'nil-signer') return void (signer = { identity: data.identity as string, secret: data.secret as Uint8Array });
  if (kind === 'nil-verifier') return ledger.key(data.identity as string, data.publicKey as Uint8Array, Date.now());
  if (kind === 'nil-forget') return ledger.forget(data.identity as string);
  if (kind === 'encode' || kind === 'decode') {
    const streams = wrap(kind, data.readableStream as ReadableStream<Frame>, data.writableStream as WritableStream<Frame>, data.participantIdentity as string, data.trackId as string);
    return theirMessage?.({ data: { kind, data: { ...data, readableStream: streams.readable, writableStream: streams.writable } } });
  }
  theirMessage?.(ev);
};

// Firefox and Safari hand the worker each sender and receiver as an event instead
if (theirTransform) {
  scope.onrtctransform = (ev) => {
    const { options } = ev.transformer;
    const streams = wrap(options.kind, ev.transformer.readable, ev.transformer.writable, options.participantIdentity, options.trackId);
    theirTransform({ transformer: { options, ...streams } });
  };
}

setInterval(() => {
  for (const identity of ledger.check(Date.now())) scope.postMessage({ kind: 'nil-forged', data: { participantIdentity: identity } });
}, 500);
