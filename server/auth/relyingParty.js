import config from '../config.js';
import originAllowed from '../security/originAllowed.js';
import publicWorkspace from '../services/publicWorkspace.js';

// Who the browser thinks it's talking to. Wallet sign-in messages are bound to this domain.
export default function relyingParty(req) {
  let origin = config.appUrl;
  if (!origin && req.headers.origin && originAllowed(req)) origin = req.headers.origin.replace(/\/$/, '');
  if (!origin) origin = `${req.protocol}://${req.get('host')}`;
  const url = new URL(origin);
  return { origin: url.origin, host: url.host, rpID: url.hostname, name: publicWorkspace()?.name ?? 'Nil' };
}
