import frameFooter from './frameFooter';
import frameManifest from './frameManifest';

// how often a sender signs a list of the frames it sent, and on how many frames of each layer the
// list rides, so a lost frame doesn't lose it
const WINDOW_MS = 200;
const CARRY = 2;

interface Layer {
  carry: number;
  floor: number;
}

// One outgoing track on the SFU, after LiveKit encrypted each frame: every frame is named in a
// signed list covering this window and the one before, and padded (frameFooter). A track sent
// as several layers lists every layer's frames, so whichever layer reaches someone, its frames
// are on the list it carries.
export default function frameSender(identity: string, secret: Uint8Array, start = 0) {
  let counter = start;
  let previous: string[] = [];
  let current: string[] = [];
  let last = -Infinity;
  let list: Uint8Array | null = null;
  const layers = new Map<number, Layer>();

  return {
    // the frame as it goes out; `layer` is the stream it's in (its SSRC)
    out(frame: Uint8Array, layer: number, audio: boolean, now: number): Uint8Array {
      let state = layers.get(layer);
      if (!state) layers.set(layer, (state = { carry: 0, floor: 0 }));
      current.push(frameManifest.hash(frame));
      if (now - last >= WINDOW_MS || current.length + previous.length >= frameManifest.max) {
        list = frameManifest.sign([...previous, ...current], ++counter, identity, secret);
        previous = current;
        current = [];
        last = now;
        for (const l of layers.values()) l.carry = CARRY;
      }
      const riding = state.carry > 0 ? list : null;
      if (riding) state.carry--;
      const size = frameFooter.target(frame.length, audio, state.floor);
      if (audio) state.floor = size;
      return frameFooter.wrap(frame, riding, size + (riding?.length ?? 0));
    },

    counter: () => counter,
  };
}
