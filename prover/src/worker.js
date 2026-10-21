import handle from './handle.js';

// The prover as a Web Worker: each message is one request, answered with one message.
self.onmessage = async (event) => {
  self.postMessage(await handle(event.data));
};
