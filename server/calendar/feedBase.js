import config from '../config.js';

// The address links in a feed point to: APP_URL when it's set, else the address the request came in on.
export default function feedBase(req) {
  return config.appUrl ?? `${req.protocol}://${req.get('host')}`;
}
