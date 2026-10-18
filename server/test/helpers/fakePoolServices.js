import http from 'node:http';
import { once } from 'node:events';

const pad = (hex) => String(hex).replace(/^0x/, '').toLowerCase().padStart(64, '0');

// A fake Privacy Pools relayer and association set provider on one local port. It answers the
// way 0xbow's services do, records every request (method, path, headers, body), and can be told
// to misbehave: refuse, redirect elsewhere, send too much, or sign terms for someone else.
export default async function fakePoolServices() {
  const state = { feeBps: 42n, feeRecipient: '0x00000000000000000000000000000000000fee00', txHash: null, refuse: false, redirect: null, huge: false, otherRecipient: null, aspLeaves: [], stateLeaves: [], reviews: [] };
  const requests = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      requests.push({ method: req.method, path: req.url, headers: req.headers, body });
      const send = (status, data) => {
        res.statusCode = status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
      };
      if (state.redirect) {
        res.statusCode = 302;
        res.setHeader('Location', state.redirect);
        return res.end();
      }
      if (state.huge) return send(200, { aspLeaves: Array.from({ length: 400_000 }, () => '1'.repeat(70)), stateTreeLeaves: [] });
      if (req.url === '/relayer/quote') {
        const recipient = state.otherRecipient ?? body.recipient;
        const withdrawalData = `0x${pad(recipient)}${pad(state.feeRecipient)}${state.feeBps.toString(16).padStart(64, '0')}`;
        return send(200, { baseFeeBPS: '10', feeBPS: state.feeBps.toString(), gasPrice: '1', feeCommitment: { expiration: Date.now() + 60_000, asset: body.asset, withdrawalData, signedRelayerCommitment: `0x${'5'.repeat(130)}`, extraGas: body.extraGas, amount: body.amount } });
      }
      if (req.url === '/relayer/request') {
        if (state.refuse) return send(400, { success: false, error: 'Relayer said no \u0007 politely', timestamp: Date.now(), requestId: 'r1' });
        return send(200, { success: true, txHash: state.txHash, timestamp: Date.now(), requestId: 'r1' });
      }
      if (/\/public\/mt-leaves$/.test(req.url)) return send(200, { aspLeaves: state.aspLeaves, stateTreeLeaves: state.stateLeaves });
      if (/\/public\/deposits-by-label$/.test(req.url)) return send(200, state.reviews);
      send(404, { message: 'not found' });
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { url: `http://127.0.0.1:${server.address().port}`, state, requests, close: () => server.close() };
}
