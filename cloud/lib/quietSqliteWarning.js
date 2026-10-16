// node:sqlite still prints an ExperimentalWarning on Node 22. The app silences it with a
// command-line flag, which `node cloud/cli.js` can't carry, so the entry points drop exactly
// that one warning and keep every other. Must run before node:sqlite is first loaded, which is
// why the entry points import their real code dynamically after calling this.
export default function quietSqliteWarning() {
  const emit = process.emitWarning;
  process.emitWarning = (warning, ...rest) => {
    if (String(warning?.message ?? warning).includes('SQLite is an experimental feature')) return;
    emit.call(process, warning, ...rest);
  };
}
