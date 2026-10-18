import initial from './migrations/001-initial.js';
import invoiceSlots from './migrations/002-invoice-slots.js';
import invoiceCounter from './migrations/003-invoice-counter.js';
import workspaceLocks from './migrations/004-workspace-locks.js';

// In order. Never edit one that has shipped: add the next.
const migrations = Object.freeze([initial, invoiceSlots, invoiceCounter, workspaceLocks]);

export default migrations;
