// What a server's Content-Security-Policy would let in beyond Nil's own code. The checked files
// only mean something if the page can't also run scripts from somewhere else, so script-src may
// name nothing but the app's own origin and WebAssembly compilation, and the fallbacks behind it
// have to stay as tight.
const EXPECTED = {
  'script-src': "'self' 'wasm-unsafe-eval'",
  'default-src': "'self'",
  'object-src': "'none'",
  'base-uri': "'none'",
};

export default function cspProblems(header) {
  if (!header) return ['No Content-Security-Policy header, so the page could run scripts from anywhere.'];
  // Several policies arrive joined by commas, and a browser enforces all of them, so a
  // directive is as tight as the tightest policy that sets it.
  const policies = header.split(',').map((policy) => new Map(policy.split(';').map((part) => part.trim().split(/\s+/)).filter((words) => words[0]).map(([name, ...values]) => [name.toLowerCase(), values.join(' ')])));
  return Object.entries(EXPECTED)
    .filter(([name, value]) => !policies.some((policy) => policy.get(name) === value))
    .map(([name, value]) => `Content-Security-Policy sets ${name} to ${policies.map((p) => p.get(name)).find(Boolean) ?? 'nothing'}, where Nil sends ${value}.`);
}
