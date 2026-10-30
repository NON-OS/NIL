import fs from 'node:fs';
import path from 'node:path';
import caddyfile from './caddyfile.js';

// Caddy runs as root with every capability dropped, so it can't override file permissions and
// the file has to be readable by others. It can carry the RPC node's credentials (see the relay
// in caddyfile.js): keep it where only Caddy and the control plane can reach it, which in the
// compose setup is a volume only those two containers mount.
function save(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o755 });
  fs.writeFileSync(`${file}.tmp`, content);
  fs.chmodSync(`${file}.tmp`, 0o644);
  fs.renameSync(`${file}.tmp`, file);
}

// Keeps Caddy's configuration, and the relay's list of workspace secrets, in step with the
// control database. Syncs never overlap: one asked
// for while another runs is folded into a single follow-up run, so a burst of sign-ups causes at
// most two reloads. A configuration Caddy rejects is rolled back on disk, so a later restart of
// Caddy still finds a file it can load.
export default function createRoutes(ctx, reload) {
  let running = null;
  let again = false;
  const generate = () => caddyfile(ctx.config, ctx.store.workspaces.list(), ctx.driver.upstream);

  async function once() {
    // a relay that can't be updated must not hold up the routes
    try {
      ctx.turn?.sync();
    } catch (err) {
      await ctx.alert('turn.secrets_failed', { message: err.message });
    }
    const text = generate();
    const file = ctx.config.caddy.file;
    let previous = null;
    try {
      previous = fs.readFileSync(file, 'utf8');
    } catch {}
    if (text === previous) return false;
    save(file, text);
    try {
      await reload();
    } catch (err) {
      if (previous !== null) save(file, previous);
      await ctx.alert('routes.reload_failed', { message: err.message });
      throw err;
    }
    ctx.log.info('routes.updated', {});
    return true;
  }

  return {
    sync() {
      if (running) {
        again = true;
        return running;
      }
      running = (async () => {
        try {
          let changed = await once();
          while (again) {
            again = false;
            changed = (await once()) || changed;
          }
          return changed;
        } finally {
          running = null;
        }
      })();
      return running;
    },

    // writes the file without reloading, for the first start before Caddy is up
    write: () => save(ctx.config.caddy.file, generate()),
  };
}
