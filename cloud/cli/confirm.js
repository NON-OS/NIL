import readline from 'node:readline/promises';

// For destructive commands: the operator types the workspace name back. --yes skips it, for
// scripts that have already confirmed in their own way.
export default async function confirm(question, expected, { yes = false, input = process.stdin, output = process.stdout } = {}) {
  if (yes) return true;
  if (!input.isTTY) throw new Error('This needs confirmation. Run it in a terminal, or add --yes.');
  const rl = readline.createInterface({ input, output });
  try {
    return (await rl.question(`${question}\nType ${expected} to confirm: `)).trim() === expected;
  } finally {
    rl.close();
  }
}
