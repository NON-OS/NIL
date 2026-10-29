import callApi, { type IceGrant } from './callApi';
import storage from '../../lib/storage';

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

  // Relay only, unless an admin allowed direct connections and this person also turned them on
  // for this device: then a browser may also offer its own addresses, and the other side learns
  // them. The server alone can never switch a browser to showing its address.
  current(): RTCConfiguration {
    return { iceServers: grant?.iceServers ?? [], iceTransportPolicy: iceConfig.relayOnly() ? 'relay' : 'all', bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' };
  },

  relayOnly: () => grant?.policy !== 'all' || !iceConfig.directHere(),

  directHere: () => storage.get<boolean>('call-direct', false) === true,
  setDirectHere: (on: boolean) => storage.set('call-direct', on),

  clear() {
    clearTimeout(refresh);
    grant = null;
  },
};

export default iceConfig;
