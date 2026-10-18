import http from 'node:http';
import relayCall from './relayCall.mjs';

const pad = (hex) => hex.replace(/^0x/, '').toLowerCase().padStart(64, '0');

// A relayer and an association set provider for a fork of mainnet, where 0xbow's own can't
// reach. The relayer does what 0xbow's does: it quotes a fee, signs nothing that matters here,
// and sends Entrypoint.relay from its own wallet, paying the gas and taking the fee. The
// provider serves the leaves it's given, which the check keeps in step with the root it puts
// on-chain as the real postman.
export default async function forkPoolServices({ relayer, entrypoint, feeBps = 50n }) {
  const state = { aspLeaves: [], stateLeaves: [], requests: [] };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      const body = raw ? JSON.parse(raw) : null;
      state.requests.push({ path: req.url, headers: req.headers, body });
      const send = (status, data) => {
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      };
      try {
        if (req.url === '/relayer/quote') {
          const withdrawalData = `0x${pad(body.recipient)}${pad(relayer.address)}${feeBps.toString(16).padStart(64, '0')}`;
          return send(200, { baseFeeBPS: String(feeBps), feeBPS: String(feeBps), gasPrice: '1', feeCommitment: { expiration: Date.now() + 60_000, asset: body.asset, withdrawalData, signedRelayerCommitment: `0x${'00'.repeat(65)}`, extraGas: false, amount: body.amount } });
        }
        if (req.url === '/relayer/request') {
          const data = relayCall(body.withdrawal, { proof: body.proof, publicSignals: body.publicSignals }, BigInt(body.scope));
          const txHash = await relayer.send({ to: entrypoint, data, gas: 1_500_000n });
          return send(200, { success: true, txHash, timestamp: Date.now(), requestId: 'fork' });
        }
        if (/\/public\/mt-leaves$/.test(req.url)) return send(200, { aspLeaves: state.aspLeaves, stateTreeLeaves: state.stateLeaves });
        if (/\/public\/deposits-by-label$/.test(req.url)) {
          const labels = String(req.headers['x-labels'] ?? '').split(',');
          return send(200, labels.map((label) => ({ label, reviewStatus: state.aspLeaves.includes(label) ? 'approved' : 'pending' })));
        }
        send(404, { message: 'not found' });
      } catch (err) {
        send(400, { success: false, error: String(err.message ?? err).slice(0, 300) });
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  return { url: `http://127.0.0.1:${server.address().port}`, state, close: () => server.close() };
}
