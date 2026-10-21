import handle from '../../../prover/src/handle.js';

// The prover run in this process behind the Worker interface the app uses, so tests go through
// the same messages a browser does. Each message is copied the way postMessage copies it, so a
// request or reply that isn't plain data fails here as it would there.
export default function inProcessProver() {
  globalThis.Worker = class {
    postMessage(data) {
      handle(structuredClone(data)).then((reply) => this.onmessage?.({ data: structuredClone(reply) }));
    }

    terminate() {}
  };
}
