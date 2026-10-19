// A phone wallet without a phone: WalletConnect's sign client in Node, with a throwaway key made
// in memory for this run. It approves the connection for the networks Nil asks for, signs text
// the way personal_sign does, and answers transactions with a made-up hash (the live check pays
// nothing). The key, the pairing link and what it signs are never printed or written anywhere.
import { SignClient } from '@walletconnect/sign-client';
import wallet from '../../../server/test/helpers/wallet.js';

export default async function headlessWallet({ projectId, relayUrl, answerAfterMs = 0 }) {
  const key = wallet();
  const seen = [];
  const ended = [];
  const client = await SignClient.init({
    projectId,
    relayUrl,
    customStoragePrefix: `headless-${Date.now()}`,
    logger: 'silent',
    telemetryEnabled: false,
    metadata: { name: 'Headless Test Wallet', description: 'Nil’s live phone wallet check', url: 'https://wallet.invalid', icons: [] },
  });

  client.on('session_proposal', ({ id, params }) => {
    const asked = params.optionalNamespaces?.eip155 ?? params.requiredNamespaces?.eip155;
    seen.push({ kind: 'proposal', chains: asked.chains, methods: asked.methods, from: params.proposer?.metadata?.url });
    void client.approve({ id, namespaces: { eip155: { chains: asked.chains, methods: asked.methods, events: asked.events, accounts: asked.chains.map((c) => `${c}:${key.address}`) } } });
  });

  client.on('session_request', ({ topic, id, params }) => {
    const { method, params: args } = params.request;
    const text = method === 'personal_sign' ? Buffer.from(String(args[0]).slice(2), 'hex').toString('utf8') : null;
    seen.push({ kind: 'request', method, chainId: params.chainId, text });
    const result = method === 'personal_sign' ? key.sign(text) : method === 'eth_sendTransaction' ? `0x${'cd'.repeat(32)}` : null;
    setTimeout(() => void client.respond({ topic, response: { id, jsonrpc: '2.0', result } }), answerAfterMs);
  });

  client.on('session_delete', ({ topic }) => ended.push(topic));

  return {
    address: key.address,
    seen,
    ended,
    pair: (uri) => client.pair({ uri }),
    sessions: () => client.session.getAll().length,
    async close() {
      client.core.heartbeat.stop();
      await client.core.relayer.transportClose().catch(() => {});
    },
  };
}
