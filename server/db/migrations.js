import initial from './migrations/001-initial.js';
import optionalEmail from './migrations/002-optional-email.js';
import identityAndProofs from './migrations/003-identity-and-proofs.js';
import walletOnly from './migrations/004-wallet-only.js';
import noxBounties from './migrations/005-nox-bounties.js';
import holdersAndVotes from './migrations/006-holders-and-votes.js';
import everyday from './migrations/007-everyday.js';
import encryptedDocs from './migrations/008-encrypted-docs.js';
import apiTokens from './migrations/009-api-tokens.js';
import rewardTokens from './migrations/010-reward-tokens.js';
import sharing from './migrations/011-sharing.js';
import publicBounties from './migrations/012-public-bounties.js';

// Append new migrations to the end. Never edit one that has shipped.
// An object entry with `rebuild: true` runs with foreign keys off, which SQLite
// needs for table rebuilds; foreign keys are re-checked before committing.
const migrations = [initial, optionalEmail, identityAndProofs, walletOnly, noxBounties, holdersAndVotes, everyday, encryptedDocs, apiTokens, rewardTokens, sharing, publicBounties];

export default migrations;
