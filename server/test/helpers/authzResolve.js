const PEOPLE = new Set(['guest', 'member', 'admin', 'owner']);

// Turns a matrix row into the URL and body one actor sends. A path parameter names what it
// points at: a target ("task"), a workspace id ("ids.member"), a fresh target made for this one
// call ("fresh.doc"), or one of the caller's own things ("own.token"; callers who own nothing
// here get the member's). A function works out anything else.
// A caller who is refused can't use anything up, so all of them share one made per row.
async function value(spec, ctx, actor, allowed, shared) {
  if (typeof spec === 'function') return spec(ctx, actor);
  if (spec.startsWith('ids.')) return ctx.world.ids[spec.slice(4)];
  if (!spec.startsWith('fresh.') && !spec.startsWith('own.')) return ctx.t[spec];
  if (!allowed && shared.has(spec)) return shared.get(spec);
  const made = spec.startsWith('fresh.') ? await ctx.t.fresh[spec.slice(6)]() : await ctx.t.fresh.own[spec.slice(4)](allowed && PEOPLE.has(actor) ? actor : 'member');
  if (!allowed) shared.set(spec, made);
  return made;
}

export default async function authzResolve(path, row, ctx, actor, { allowed = true, shared = new Map() } = {}) {
  let url = path;
  for (const [, name] of path.matchAll(/:(\w+)/g)) url = url.replace(`:${name}`, encodeURIComponent(await value(row[name], ctx, actor, allowed, shared)));
  const query = row.query ? `?${await row.query(ctx, actor)}` : '';
  const body = typeof row.body === 'function' ? await row.body(ctx, actor) : row.body;
  return { url: url + query, body, raw: row.raw, headers: row.headers };
}
