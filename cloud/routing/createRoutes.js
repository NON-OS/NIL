import fs from 'node:fs';
import path from 'node:path';
import caddyfile from './caddyfile.js';

// Keeps Caddy's configuration in step with the control database. Syncs never overlap: one asked
// for while another runs is folded into a single follow-up run, so a burst of sign-ups causes at
// most two reloads. A configuration Caddy rejects is rolled back on disk, so a later restart of
// Caddy still finds a file it can load.
export default function createRoutes(ctx, reload) {
  let running = null;
  let again = false;

  async function once() {
    const workspaces = ctx.store.workspaces.list();
    const text = caddyfile(ctx.config, workspaces, ctx.driver.upstream);
    const file = ctx.config.caddy.file;
    let previous = null;
    try {
      previous = fs.readFileSync(file, 'utf8');
    } catch {}
    if (text === previous) return false;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const write = (content) => {
      fs.writeFileSync(`${file}.tmp`, content, { mode: 0o644 });
      fs.renameSync(`${file}.tmp`, file);
    };
    write(text);
    try {
      await reload();
    } catch (err) {
      if (previous !== null) write(previous);
      await ctx.alert('routes.reload_failed', { message: err.message });
      throw err;
    }
    ctx.log.info('routes.updated', { workspaces: workspaces.length });
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
    write() {
      const text = caddyfile(ctx.config, ctx.store.workspaces.list(), ctx.driver.upstream);
      fs.mkdirSync(path.dirname(ctx.config.caddy.file), { recursive: true });
      fs.writeFileSync(ctx.config.caddy.file, text, { mode: 0o644 });
    },
  };
}
