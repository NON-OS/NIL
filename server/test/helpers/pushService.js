// Stands in for the browser makers' push services: requests to `host` are recorded and answered
// with `status`, everything else goes to the real network stack untouched.
export default function pushService(host) {
  const realFetch = globalThis.fetch;
  const received = [];
  const service = { received, status: 201 };
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url ?? String(input));
    if (url.hostname !== host) return realFetch(input, init);
    received.push({ url: url.href, headers: Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v])), body: Buffer.from(init.body), redirect: init.redirect });
    return new Response(null, { status: service.status });
  };
  service.restore = () => {
    globalThis.fetch = realFetch;
  };
  // Deliveries happen just after the request that caused them: note where the list stands
  // before acting, then wait for what came after.
  service.mark = () => received.length;
  service.since = async (mark, count = 1, timeout = 2000) => {
    const deadline = Date.now() + timeout;
    while (received.length < mark + count && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10));
    return received.slice(mark);
  };
  service.settle = (wait = 200) => new Promise((r) => setTimeout(r, wait));
  return service;
}
