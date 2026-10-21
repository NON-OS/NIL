import initial from './migrations/001-initial.js';
import invoiceSlots from './migrations/002-invoice-slots.js';
import invoiceCounter from './migrations/003-invoice-counter.js';
import workspaceLocks from './migrations/004-workspace-locks.js';
import signupRequests from './migrations/005-signup-requests.js';
import activity from './migrations/006-activity.js';
import trialWallets from './migrations/007-trial-wallets.js';

// In order. Never edit one that has shipped: add the next.
const migrations = Object.freeze([initial, invoiceSlots, invoiceCounter, workspaceLocks, signupRequests, activity, trialWallets]);

export default migrations;
