import initial from './migrations/001-initial.js';
import invoiceSlots from './migrations/002-invoice-slots.js';

// In order. Never edit one that has shipped: add the next.
const migrations = Object.freeze([initial, invoiceSlots]);

export default migrations;
