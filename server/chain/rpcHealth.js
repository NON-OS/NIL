// Whether the Ethereum node answered the last time it was asked, for /healthz. Only times are
// kept: never the node's address, the method or what was looked up. The node is only called
// when there is work for it, so these can be hours old; /healthz never calls it itself.
let lastAnswer = 0;
let lastFailure = 0;

const iso = (ms) => (ms ? new Date(ms).toISOString() : null);

const rpcHealth = {
  answered() {
    lastAnswer = Date.now();
  },

  failed() {
    lastFailure = Date.now();
  },

  report: () => ({
    reachable: lastAnswer || lastFailure ? lastAnswer >= lastFailure : null,
    lastAnswer: iso(lastAnswer),
    lastFailure: iso(lastFailure),
  }),
};

export default rpcHealth;
