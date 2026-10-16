// Every route an Express app answers, as "METHOD /path", found by walking its router stack and
// every router mounted inside it. A mount path is read back from the pattern Express compiled
// for it; anything this can't read comes back with a "?" so a test notices instead of skipping.
function mountPath(layer) {
  if (layer.regexp.fast_slash) return '';
  const match = /^\^\\\/(.*?)\\\/\?\(\?=\\\/\|\$\)$/.exec(layer.regexp.source);
  return match ? `/${match[1].replace(/\\\//g, '/')}` : `?${layer.regexp.source}`;
}

export default function listRoutes(app) {
  const out = new Set();
  const walk = (stack, prefix) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          for (const p of [].concat(layer.route.path)) out.add(`${method === '_all' ? 'ALL' : method.toUpperCase()} ${`${prefix}${p}`.replace(/(.)\/$/, '$1')}`);
        }
      } else if (layer.handle?.stack) walk(layer.handle.stack, prefix + mountPath(layer));
    }
  };
  walk(app._router.stack, '');
  return [...out];
}
