import initial from './migrations/001-initial.js';

// In order. Never edit one that has shipped: add the next.
const migrations = Object.freeze([initial]);

export default migrations;
