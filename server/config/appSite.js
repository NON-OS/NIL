import refuseToStart from '../lib/refuseToStart.js';

// Where people reach this server. Wallet sign-in messages name this domain and only this origin
// may make changes, so it can never be read from request headers, where a phishing site would put
// its own. Plain http is accepted only on this machine and for .onion addresses, which Tor
// already authenticates. It's required, so a bad value stops the server.
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function site(value) {
  const help = 'Set it to the address people type: https://nil.example.com, http://<your-address>.onion for Tor, or http://localhost:3000 on this machine (http://localhost:5173 with npm run dev).';
  if (!value) refuseToStart(`APP_URL is required. ${help}`);
  let url;
  try {
    url = new URL(value);
  } catch {
    refuseToStart(`APP_URL isn’t a web address. ${help}`);
  }
  const local = LOCAL_HOSTS.has(url.hostname);
  const plainAllowed = local || url.hostname.endsWith('.onion');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && plainAllowed)) refuseToStart(`APP_URL must start with https://, except for localhost and .onion addresses. ${help}`);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) refuseToStart(`APP_URL must be the address alone, with no path. ${help}`);
  return Object.freeze({ origin: url.origin, local });
}

export default site((process.env.APP_URL ?? '').trim());
