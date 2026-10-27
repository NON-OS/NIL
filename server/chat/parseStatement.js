import HttpError from '../lib/HttpError.js';
import parseJSON from '../lib/parseJSON.js';

const MAX = 4096;

// A signed statement as a browser makes one (see chatDeparture in the web app): who signed it,
// what it names, the signature and when. The server can't check the signature against anything
// a browser would trust, so it checks the shape and that it says what the request does; every
// member's browser checks the signature before it counts.
export default function parseStatement(raw, { by, text }) {
  const value = typeof raw === 'string' && raw.length <= MAX ? parseJSON(raw, null) : null;
  const facts = value?.facts;
  const fits = value?.v === 2 && value.by === by && value.text === text && typeof value.sig === 'string' && value.sig.length <= 200 && Array.isArray(facts) && facts.length === 1 && Number.isSafeInteger(facts[0]) && facts[0] > 0;
  if (!fits) throw HttpError.badRequest('That statement isn’t signed the way Nil signs one.');
  return raw;
}
