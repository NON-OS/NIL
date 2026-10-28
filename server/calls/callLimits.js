import config from '../config.js';

// How big a call may get, and when it moves from browser to browser onto the SFU. Without an
// SFU every call stays a mesh, up to CALL_MAX_PEERS.
const callLimits = {
  sfu: () => config.calls.sfu !== null,
  max: () => (config.calls.sfu ? config.calls.sfuMaxPeers : config.calls.maxPeers),
  // a call moves to the SFU once it has more people than a mesh carries well, and stays there
  wantsSfu: (call, people) => call.mode === 'mesh' && config.calls.sfu !== null && people > config.calls.meshMaxPeers,
};

export default callLimits;
