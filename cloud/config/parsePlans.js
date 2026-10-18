import parseBytes from '../lib/parseBytes.js';

const NAME = /^[a-z][a-z0-9-]{0,23}$/;

// Resource plans as "name:cpus=1,memory=768m,pids=256,disk=5g;name2:...". cpus, memory and pids
// are hard limits enforced by the runtime. Local Docker volumes can't be capped, so disk is
// enforced in two other ways: the app gets it as its storage quota (WORKSPACE_STORAGE_MB) and
// refuses uploads past it, and a workspace that still grows past CLOUD_DISK_SUSPEND_PERCENT of
// it is suspended (ops/collectUsage.js).
export default function parsePlans(value) {
  const plans = {};
  const problems = [];
  for (const entry of value.split(';').map((s) => s.trim()).filter(Boolean)) {
    const [name, spec = ''] = entry.split(':');
    if (!NAME.test(name ?? '')) {
      problems.push(`“${name}” isn’t a valid plan name (lowercase letters, digits and dashes).`);
      continue;
    }
    const fields = Object.fromEntries(spec.split(',').map((pair) => pair.split('=').map((s) => s.trim())));
    const cpus = Number(fields.cpus);
    const memoryBytes = parseBytes(fields.memory);
    const pids = Number(fields.pids);
    const diskBytes = parseBytes(fields.disk);
    if (!(cpus > 0 && cpus <= 64)) problems.push(`Plan ${name}: cpus must be a number above 0, for example 1 or 0.5.`);
    if (!memoryBytes || memoryBytes < 128 * 1024 ** 2) problems.push(`Plan ${name}: memory must be at least 128m.`);
    if (!Number.isInteger(pids) || pids < 32) problems.push(`Plan ${name}: pids must be a whole number of at least 32.`);
    if (!diskBytes) problems.push(`Plan ${name}: disk must be a size such as 5g.`);
    plans[name] = Object.freeze({ name, cpus, memoryBytes, pids, diskBytes });
  }
  if (!Object.keys(plans).length) problems.push('No resource plan could be read.');
  return { plans: Object.freeze(plans), problems };
}
