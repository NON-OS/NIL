// A module resolution hook for `node --test`. The web app's TypeScript modules import each
// other without file extensions, the way Vite expects, which Node refuses on its own. An
// extensionless relative import that doesn't resolve is retried with `.ts`, then `.tsx`.
// Node's hook API needs this named export.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (err?.code !== 'ERR_MODULE_NOT_FOUND' || !/^\.{1,2}\//.test(specifier) || /\.[cm]?[jt]sx?$|\.css$/.test(specifier)) throw err;
    try {
      return await next(`${specifier}.ts`, context);
    } catch {
      return next(`${specifier}.tsx`, context);
    }
  }
}
