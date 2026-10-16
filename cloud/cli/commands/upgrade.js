import findWorkspace from '../findWorkspace.js';
import rollingUpgrade from '../../provisioning/rollingUpgrade.js';

// upgrade <name...> --image <image>, or upgrade --all --image <image>. Each workspace is
// checkpointed, upgraded and health-checked in turn, and rolled back on its own if it fails.
export default async function upgrade(ctx, { args, options, print }) {
  if (!options.image || (!options.all && !args.length)) throw new Error('Usage: upgrade <name...>|--all --image <image> [--max-failures <n>]');
  const ids = options.all ? undefined : args.map((name) => findWorkspace(ctx, name).id);
  const maxFailures = options['max-failures'] === undefined ? undefined : Number(options['max-failures']);
  if (maxFailures !== undefined && !(Number.isInteger(maxFailures) && maxFailures >= 0)) throw new Error('--max-failures must be a whole number.');
  print(`Upgrading to ${options.image}, one workspace at a time.`);
  const summary = await rollingUpgrade(ctx, options.image, {
    ids,
    maxFailures,
    onResult: (r) => print(`  ${r.name}: ${r.result}${r.reason ? ` (${r.reason})` : ''}${r.result === 'failed' ? (r.rolledBack ? ', rolled back' : ', ROLLBACK FAILED') : ''}`),
  });
  print(`\n${summary.upgraded.length} upgraded, ${summary.skipped.length} skipped, ${summary.failed.length} failed${summary.untouched.length ? `, ${summary.untouched.length} not attempted after too many failures` : ''}.`);
  return summary.failed.length || summary.untouched.length ? 1 : 0;
}
