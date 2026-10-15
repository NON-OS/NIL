import initial from './migrations/001-initial.js';
import optionalEmail from './migrations/002-optional-email.js';
import identityAndProofs from './migrations/003-identity-and-proofs.js';

// Append new migrations to the end. Never edit one that has shipped.
// An object entry with `rebuild: true` runs with foreign keys off, which SQLite
// needs for table rebuilds; foreign keys are re-checked before committing.
const migrations = [initial, optionalEmail, identityAndProofs];

export default migrations;
