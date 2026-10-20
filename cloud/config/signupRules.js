import readWordList from './readWordList.js';
import reservedNames from '../names/reservedNames.js';
import blockedWords from '../names/blockedWords.js';
import blockedParts from '../names/blockedParts.js';

// The sign-up settings: who may create a workspace, how often, and which addresses. Limits on
// networks count IPv6 per /56 and, more loosely, per /48 block (see signup/ipKey.js).
export default function signupRules(read) {
  const nameMin = read.number('CLOUD_NAME_MIN', 3, { min: 1, max: 63 });
  const nameMax = read.number('CLOUD_NAME_MAX', 32, { min: nameMin, max: 63 });
  if (read.raw('CLOUD_SIGNUPS_PER_HOUR')) {
    read.warn('CLOUD_SIGNUPS_PER_HOUR is no longer used: one budget for everyone let one network close sign-ups. See CLOUD_SIGNUPS_PER_BLOCK_PER_HOUR and CLOUD_SIGNUPS_PER_DAY.');
  }
  return Object.freeze({
    open: read.oneOf('CLOUD_SIGNUP', ['open', 'closed'], 'open') === 'open',
    maxWorkspaces: read.number('CLOUD_MAX_WORKSPACES', 300, { min: 1 }),
    perWallet: read.number('CLOUD_MAX_PER_WALLET', 3, { min: 1 }),
    perWalletPerDay: read.number('CLOUD_SIGNUPS_PER_WALLET_PER_DAY', 2, { min: 1 }),
    perIpPerDay: read.number('CLOUD_SIGNUPS_PER_IP_PER_DAY', 3, { min: 1 }),
    perBlockPerDay: read.number('CLOUD_SIGNUPS_PER_BLOCK_PER_DAY', 10, { min: 1 }),
    perBlockPerHour: read.number('CLOUD_SIGNUPS_PER_BLOCK_PER_HOUR', 3, { min: 1 }),
    // past either of these, a sign-up waits for the operator instead of starting at once
    perDay: read.number('CLOUD_SIGNUPS_PER_DAY', 100, { min: 1 }),
    approvalAbovePercent: read.number('CLOUD_APPROVAL_ABOVE_PERCENT', 90, { min: 1, max: 100 }),
    // below this much free disk, new sign-ups pause until there's room again; 0 never pauses
    minFreeDiskPercent: read.number('CLOUD_SIGNUP_MIN_FREE_DISK_PERCENT', 10, { max: 99 }),
    requestDays: read.number('CLOUD_SIGNUP_REQUEST_DAYS', 7, { min: 1 }),
    challengesPerIp: read.number('CLOUD_CHALLENGES_PER_IP', 20, { min: 1 }),
    challengesPerBlock: read.number('CLOUD_CHALLENGES_PER_BLOCK', 60, { min: 1 }),
    nameChecksPerIp: read.number('CLOUD_NAME_CHECKS_PER_IP', 60, { min: 1 }),
    powBits: read.number('CLOUD_POW_BITS', 16, { max: 24 }),
    nameMin,
    nameMax,
    reserved: Object.freeze(new Set([...reservedNames, ...read.list('CLOUD_RESERVED_NAMES').map((n) => n.toLowerCase())])),
    blocked: Object.freeze([...blockedWords, ...readWordList(read.text('CLOUD_BLOCKLIST_FILE'), read)]),
    blockedParts: Object.freeze([...blockedParts, ...read.list('CLOUD_BLOCKED_PARTS').map((p) => p.toLowerCase())]),
    quarantineDays: read.number('CLOUD_NAME_QUARANTINE_DAYS', 90),
    unclaimedDays: read.number('CLOUD_UNCLAIMED_DAYS', 7),
    // a claimed workspace whose data hasn't changed for this long is paused with a notice, and
    // deleted if nobody asks for it back within the notice period; 0 keeps them all
    idleDays: read.number('CLOUD_IDLE_DAYS', 180),
    idleNoticeDays: read.number('CLOUD_IDLE_NOTICE_DAYS', 30, { min: 1 }),
    ticketMinutes: read.number('CLOUD_TICKET_MINUTES', 30, { min: 5, max: 1440 }),
  });
}
