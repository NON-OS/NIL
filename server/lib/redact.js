// Secrets the server reads from its environment. None of them belongs in a log line, so they are
// cut out of every line before it's written, whatever produced it: an SDK error that repeats a
// header, a fetch error that names the RPC address with its API key in the path.
const SECRET_SETTINGS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'SETUP_TOKEN', 'NOX_RPC_URL', 'ANTHROPIC_BASE_URL', 'NOX_VERIFIER_KEY', 'VERIFIER_KEY', 'VERIFIER_EXECUTION_RPC', 'VERIFIER_CONSENSUS_RPC'];

// short values such as "off" would blank out ordinary words
const secrets = SECRET_SETTINGS.map((name) => (process.env[name] ?? '').trim()).filter((value) => value.length >= 8);

// user:password@ in any URL
const URL_CREDENTIALS = /\/\/[^/\s:@]+:[^/\s@]+@/g;

export default function redact(text) {
  let out = text.replace(URL_CREDENTIALS, '//[redacted]@');
  for (const secret of secrets) out = out.split(secret).join('[redacted]');
  return out;
}
