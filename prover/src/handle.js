import prove from './prove.js';
import verify from './verify.js';

const OPS = { prove, verify };

// One request from the app and its reply. A request is { id, op, ...data } with op "prove" or
// "verify". The reply carries the same id and either ok: true with the result, or ok: false with
// the error's message. Nothing else crosses between the app and this program.
export default async function handle(request) {
  const id = request?.id;
  const op = Object.hasOwn(OPS, request?.op) ? OPS[request.op] : null;
  if (!op) return { id, ok: false, error: `Unknown prover request: ${String(request?.op)}` };
  try {
    return { id, ok: true, ...(await op(request)) };
  } catch (err) {
    return { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
