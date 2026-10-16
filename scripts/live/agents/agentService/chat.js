// One chat completion with tools from an OpenAI-compatible server (Ollama here). Slow CPUs need
// minutes per answer, so the timeout is generous.
export default async function chat({ endpoint, model, messages, tools, timeoutMs = 15 * 60_000, apiKey }) {
  const started = Date.now();
  const res = await fetch(`${endpoint.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', temperature: 0.3, max_tokens: 800 }),
  });
  if (!res.ok) throw new Error(`model endpoint answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const message = data.choices?.[0]?.message ?? { role: 'assistant', content: '' };
  return { message, usage: data.usage ?? {}, ms: Date.now() - started };
}
