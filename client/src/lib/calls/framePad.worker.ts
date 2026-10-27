import framePadding from './framePadding';

// Pads sound and video frames on their way out of a browser-to-browser call and strips them on the way in
// (framePadding). Chrome hands the worker each sender's and receiver's streams in a message;
// Firefox and Safari as a transform event. A sender pads once the page says the other browser
// takes padding off.

interface Frame {
  data: ArrayBuffer;
  getMetadata?: () => { mimeType?: string };
}
// H.264 and H.265 are cut up by start codes inside the frame, which padding could imitate
const unpadded = (frame: Frame) => /h26[45]/i.test(frame.getMetadata?.().mimeType ?? '');
interface Job {
  side: 'send' | 'receive';
  id: string;
  audio?: boolean;
}
interface Scope {
  onmessage: ((ev: { data: Job & { kind: string; on?: boolean; readable?: ReadableStream<Frame>; writable?: WritableStream<Frame> } }) => void) | null;
  onrtctransform?: ((ev: { transformer: { readable: ReadableStream<Frame>; writable: WritableStream<Frame>; options: Job } }) => void) | null;
}

const scope = self as unknown as Scope;
const padding = new Set<string>();

function run({ side, id, audio = false }: Job, readable: ReadableStream<Frame>, writable: WritableStream<Frame>) {
  // sound goes out at the largest size it has needed, so every frame is the same size
  let floor = 0;
  const step = new TransformStream<Frame, Frame>({
    transform(frame, out) {
      const data = new Uint8Array(frame.data);
      if (side === 'receive') frame.data = framePadding.strip(data).slice().buffer as ArrayBuffer;
      else if (padding.has(id) && !unpadded(frame)) {
        const out = framePadding.pad(data, audio, floor);
        if (audio) floor = out.length - 8;
        frame.data = out.buffer as ArrayBuffer;
      }
      out.enqueue(frame);
    },
  });
  void readable.pipeThrough(step).pipeTo(writable).catch(() => {});
}

scope.onmessage = ({ data }) => {
  if (data.kind === 'pad') return void (data.on ? padding.add(data.id) : padding.delete(data.id));
  if (data.kind === 'streams' && data.readable && data.writable) run(data, data.readable, data.writable);
};

scope.onrtctransform = ({ transformer }) => run(transformer.options, transformer.readable, transformer.writable);
