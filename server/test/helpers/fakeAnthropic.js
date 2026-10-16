import http from 'node:http';
import { once } from 'node:events';

const event = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;

// The Messages API stream for one assistant turn: text blocks and tool calls, as the real API
// sends them over server-sent events.
function stream({ text, tool, inputTokens = 120, outputTokens = 40 }) {
  const blocks = [];
  let index = 0;
  if (text) {
    blocks.push(event('content_block_start', { index, content_block: { type: 'text', text: '' } }), event('content_block_delta', { index, delta: { type: 'text_delta', text } }), event('content_block_stop', { index }));
    index += 1;
  }
  if (tool) {
    blocks.push(
      event('content_block_start', { index, content_block: { type: 'tool_use', id: tool.id, name: tool.name, input: {} } }),
      event('content_block_delta', { index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(tool.input) } }),
      event('content_block_stop', { index }),
    );
  }
  return [
    event('message_start', { message: { id: `msg_${Date.now()}`, type: 'message', role: 'assistant', model: 'test-model', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: inputTokens, output_tokens: 1 } } }),
    ...blocks,
    event('message_delta', { delta: { stop_reason: tool ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: outputTokens } }),
    event('message_stop', {}),
  ].join('');
}

// A local stand-in for the Anthropic API that records requests and streams scripted turns. A turn
// of { error: { status, message } } answers with that API error instead, as the real API does.
export default async function fakeAnthropic() {
  const requests = [];
  let turns = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      requests.push({ path: req.url, headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') });
      const turn = turns.shift() ?? { text: 'Done.' };
      if (turn.error) {
        const type = turn.error.status === 400 ? 'invalid_request_error' : 'api_error';
        res.writeHead(turn.error.status, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ type: 'error', error: { type, message: turn.error.message } }));
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.end(stream(turn));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    requests,
    script(next) {
      turns = next;
    },
    close: () => server.close(),
  };
}
