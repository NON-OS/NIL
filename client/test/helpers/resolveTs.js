import { registerHooks } from 'node:module';

// The client imports its modules without a file extension, the way Vite resolves them. Under
// plain Node, a relative import that names no extension is tried as the .ts file.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.{1,2}\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {}
    }
    return nextResolve(specifier, context);
  },
});
