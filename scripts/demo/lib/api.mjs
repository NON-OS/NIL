// Calls the workspace API from inside a signed-in page, so the request carries that person's
// session the way the app's own requests do.
export default function api(page, method, url, body) {
  return page.evaluate(
    async ([m, u, b]) => {
      const res = await fetch(`/api${u}`, { method: m, headers: { 'Content-Type': 'application/json', 'X-NONOS': '1' }, body: b ? JSON.stringify(b) : undefined });
      const text = await res.text();
      if (!res.ok) throw new Error(`${m} ${u}: ${res.status} ${text.slice(0, 200)}`);
      return text ? JSON.parse(text) : null;
    },
    [method, url, body],
  );
}
