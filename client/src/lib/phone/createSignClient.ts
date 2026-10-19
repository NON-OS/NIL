import { SignClient } from '@walletconnect/sign-client';
import hardenClient from './hardenClient';
import phoneStorage from './phoneStorage';
import type PhoneClient from '../../types/PhoneClient';
import type PhoneConfig from '../../types/PhoneConfig';

// WalletConnect's client for one connection, cut down to the relay: no telemetry, nothing
// logged, its records in our own storage under the connection's id, and a core of its own, so
// nothing from an earlier connection carries over (see hardenClient for the rest). Loaded only
// when someone connects a phone, or a reload finds one connected.
export default async function createSignClient(config: PhoneConfig, id: string) {
  const storage = phoneStorage.open(id);
  const client = await SignClient.init({
    projectId: config.projectId,
    relayUrl: config.relayUrl,
    customStoragePrefix: id,
    storage: storage as never,
    telemetryEnabled: false,
    logger: 'silent',
    // the phone shows these when asked to connect; the icon is fetched by the phone, from this server
    metadata: { name: 'Nil', description: 'Sign in and approve requests from your phone.', url: location.origin, icons: [`${location.origin}/icons/icon-192.png`] },
  });
  hardenClient(client);
  // a hook for downloading the client's logs, which stay empty with logging off
  delete (globalThis as { downloadLogsBlobInBrowser?: unknown }).downloadLogsBlobInBrowser;

  async function shutdown() {
    storage.close();
    client.core.heartbeat.stop();
    await client.core.relayer.transportClose().catch(() => {});
    delete (globalThis as Record<string, unknown>)[`_walletConnectCore_${id}`];
  }
  return { client: client as unknown as PhoneClient, shutdown };
}
