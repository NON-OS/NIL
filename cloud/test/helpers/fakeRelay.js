import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';

// A stand-in for WalletConnect's relay, on a local port: it keeps each topic's messages for
// whoever subscribes later and passes new ones on to the other subscribers, which is all the
// real one does with what it can't read. It records every connection and request, so a test can
// check what a client told the relay. It passes a message's attestation on with it, and the two
// combined publishes WalletConnect's clients send for a proposal and its approval also subscribe
// the sender, as on the real relay. The same stand-in as server/test/helpers/fakeRelay.js; the
// control plane installs its own dependencies, so its tests keep their own copy.
export default async function fakeRelay() {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const topics = new Map();
  const connections = [];
  const requests = [];
  let nextId = 1;

  const topicOf = (name) => {
    if (!topics.has(name)) topics.set(name, { subscribers: new Map(), messages: [] });
    return topics.get(name);
  };
  const deliver = (socket, subscription, name, entry) =>
    socket.send(JSON.stringify({ id: Date.now() * 1000 + (nextId++ % 1000), jsonrpc: '2.0', method: 'irn_subscription', params: { id: subscription, data: { topic: name, message: entry.message, publishedAt: entry.publishedAt, tag: entry.tag, attestation: entry.attestation } } }));

  function subscribe(socket, name) {
    const topic = topicOf(name);
    if (!topic.subscribers.has(socket)) topic.subscribers.set(socket, randomBytes(32).toString('hex'));
    const subscription = topic.subscribers.get(socket);
    // what was published before this subscriber arrived, after the subscribe's own answer
    setImmediate(() => topic.messages.filter((m) => m.from !== socket).forEach((m) => deliver(socket, subscription, name, m)));
    return subscription;
  }

  function publish(socket, name, message, tag, attestation) {
    if (typeof message !== 'string' || !message) return;
    const topic = topicOf(name);
    const entry = { message, tag, attestation, publishedAt: Date.now(), from: socket };
    topic.messages.push(entry);
    for (const [peer, subscription] of topic.subscribers) if (peer !== socket) deliver(peer, subscription, name, entry);
  }

  function answer(socket, { method, params = {} }) {
    switch (method) {
      case 'irn_subscribe':
        return subscribe(socket, params.topic);
      case 'irn_batchSubscribe':
        return (params.topics ?? []).map((t) => subscribe(socket, t));
      case 'irn_unsubscribe':
        topicOf(params.topic).subscribers.delete(socket);
        return true;
      case 'irn_publish':
        publish(socket, params.topic, params.message, params.tag, params.attestation);
        return true;
      case 'irn_batchFetchMessages':
        return { messages: [], hasMore: false };
      case 'wc_proposeSession':
        subscribe(socket, params.pairingTopic);
        publish(socket, params.pairingTopic, params.sessionProposal, 1100, params.attestation);
        return true;
      case 'wc_approveSession':
        subscribe(socket, params.sessionTopic);
        publish(socket, params.pairingTopic, params.sessionProposalResponse, 1101);
        publish(socket, params.sessionTopic, params.sessionSettlementRequest, 1102);
        return true;
      default:
        return true;
    }
  }

  server.on('connection', (socket, req) => {
    connections.push({ url: req.url, origin: req.headers.origin ?? null });
    socket.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      // acknowledgements of what this relay delivered
      if (!msg?.method) return;
      requests.push({ method: msg.method, params: msg.params });
      socket.send(JSON.stringify({ id: msg.id, jsonrpc: '2.0', result: answer(socket, msg) }));
    });
    socket.on('close', () => topics.forEach((t) => t.subscribers.delete(socket)));
  });

  return {
    url: `ws://127.0.0.1:${server.address().port}`,
    connections,
    requests,
    close() {
      for (const client of server.clients) client.terminate();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}
