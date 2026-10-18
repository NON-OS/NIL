import fs from 'node:fs';
import { parseArgs } from 'node:util';
import configOrExit from '../lib/configOrExit.js';
import createContext from '../createContext.js';
import list from './commands/list.js';
import info from './commands/info.js';
import create from './commands/create.js';
import lifecycle from './commands/lifecycle.js';
import upgrade from './commands/upgrade.js';
import rollback from './commands/rollback.js';
import refresh from './commands/refresh.js';
import remove from './commands/remove.js';
import backup from './commands/backup.js';
import restore from './commands/restore.js';
import restoreDrill from './commands/restoreDrill.js';
import verifyBackup from './commands/verifyBackup.js';
import decrypt from './commands/decrypt.js';
import keygen from './commands/keygen.js';
import maintenance from './commands/maintenance.js';
import requests from './commands/requests.js';

const HELP = `Nil control plane

Usage: node cli.js <command> [arguments] [options]

Workspaces
  list [--state <state>] [--json]        every workspace with state, plan, image, disk and owner
  info <name>                            details, recent backups and history of one workspace
  create <name> --owner <0x…>            create and start a workspace; prints its setup code
         [--plan <plan>] [--image <image>] [--any-name]
  start <name> | resume <name>           start a stopped or suspended one, or cancel a deletion
  stop <name>                            stop it, keeping its data
  suspend <name> [--reason <text>]       take it offline with a notice, keeping its data
  resize <name> <plan>                   move it to another resource plan
  refresh <name…>|--all                  recreate containers after changing cloud.env or workspace.env
  upgrade <name…>|--all --image <image>  rolling upgrade with pre-migration checkpoints
         [--max-failures <n>]            and automatic rollback on a failed health check
  rollback <name…>|--all [--yes]         back to the checkpoint from before the last upgrade
  delete <name> [--now] [--no-export] [--yes]
                                         final encrypted export, then deletion after the grace period

Sign-ups waiting for approval
  requests                               sign-ups past the daily cap or near capacity
  approve <name> | reject <name>         create and start it, or release the address

Backups
  backup <name…>|--all                   encrypted backup now (--all: the nightly job)
  restore <name> <file|location> --identity <key file> [--owner <0x…>] [--yes]
  restore-drill <file|location> --identity <key file>
                                         restore into a throwaway workspace nobody can reach,
                                         check that it starts, and remove it
  verify-backup <file|location> --identity <key file>
                                         decrypt and check a backup without writing anything
  decrypt <file> --identity <key file> --out <file>
                                         write a backup's plaintext to a file (control database recovery)
  keygen --out <file>                    new backup key pair; the secret key goes to <file>

keygen, decrypt and verify-backup of a local file need no server configuration, so they run on
the operator's own machine too, where the backup secret key belongs.

Operations
  routes [--print]                       rewrite and reload the Caddy configuration
  check                                  run health, disk, RAID, usage and claim checks now
  setup-token <name>                     show the setup code of a workspace nobody has claimed
  alert-test                             send a test alert to CLOUD_ALERT_WEBHOOK
`;

const COMMANDS = {
  list,
  info,
  create,
  start: lifecycle,
  resume: lifecycle,
  stop: lifecycle,
  suspend: lifecycle,
  resize: lifecycle,
  refresh,
  upgrade,
  rollback,
  delete: remove,
  backup,
  restore,
  'restore-drill': restoreDrill,
  'verify-backup': verifyBackup,
  decrypt,
  keygen,
  routes: maintenance,
  check: maintenance,
  'setup-token': maintenance,
  'alert-test': maintenance,
  requests,
  approve: requests,
  reject: requests,
};

// Commands that don't need Docker, the database or even a configuration, so they also run on a
// laptop with the backup secret key rather than on the server.
const standalone = (command, args) => command === 'keygen' || command === 'decrypt' || (command === 'verify-backup' && Boolean(args[0]) && fs.existsSync(args[0]));

export default async function main(argv, { print = console.log, env = process.env } = {}) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        all: { type: 'boolean' },
        'any-name': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        identity: { type: 'string' },
        image: { type: 'string' },
        json: { type: 'boolean' },
        'max-failures': { type: 'string' },
        'no-export': { type: 'boolean' },
        now: { type: 'boolean' },
        out: { type: 'string' },
        owner: { type: 'string' },
        plan: { type: 'string' },
        print: { type: 'boolean' },
        reason: { type: 'string' },
        state: { type: 'string' },
        yes: { type: 'boolean' },
      },
    });
  } catch (err) {
    console.error(err.message);
    return 2;
  }
  const [command, ...args] = parsed.positionals;
  if (!command || parsed.values.help || !COMMANDS[command]) {
    (command && !COMMANDS[command] ? console.error : print)(command && !COMMANDS[command] ? `Unknown command: ${command}\n\n${HELP}` : HELP);
    return command && !COMMANDS[command] ? 2 : 0;
  }
  try {
    const ctx = standalone(command, args) ? null : createContext(configOrExit(env), { logToStdout: false });
    return await COMMANDS[command](ctx, { command, args, options: parsed.values, print });
  } catch (err) {
    console.error(err.message);
    return 1;
  }
}
