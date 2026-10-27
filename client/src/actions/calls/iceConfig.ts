import callApi, { type IceGrant } from './callApi';

let grant: IceGrant | null = null;
let refresh: number | undefined;

// The relay settings for the call this tab is in. Relay passwords stop working after a while,
// so fresh ones are fetched three quarters of the way through, and `onFresh` moves every
// connection onto them.
const iceConfig = {
  async load(callId: string, onFresh: () => void) {
    grant = await callApi.ice(callId);
    clearTimeout(refresh);
    const ms = grant.expiresAt ? Math.max(30_000, (grant.expiresAt - Date.now()) * 0.75) : null;
    if (ms) {
      refresh = window.setTimeout(() => {
        iceConfig
          .load(callId, onFresh)
          .then(onFresh)
          .catch(() => {});
      }, ms);
    }
    return iceConfig.current();
  },

  // Relay only, unless an admin allowed direct connections: then a browser may also offer its
  // own addresses, and the other side learns them.
  current(): RTCConfiguration {
    return { iceServers: grant?.iceServers ?? [], iceTransportPolicy: grant?.policy ?? 'relay', bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' };
  },

  relayOnly: () => (grant?.policy ?? 'relay') === 'relay',

  clear() {
    clearTimeout(refresh);
    grant = null;
  },
};

export default iceConfig;
