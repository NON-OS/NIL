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
import plan from './migrations/013-plan.js';
import privacy from './migrations/014-privacy.js';
import votePower from './migrations/015-vote-power.js';
import encryptedBallots from './migrations/016-encrypted-ballots.js';
import sealedTasks from './migrations/017-sealed-tasks.js';
import sealedFiles from './migrations/018-sealed-files.js';
import purgeIndexes from './migrations/019-purge-indexes.js';
import heldBallots from './migrations/024-held-ballots.js';
import dueTimesPushFeeds from './migrations/021-due-times-push-feeds.js';
import everydayTeams from './migrations/022-everyday-teams.js';
import signedKeys from './migrations/023-signed-keys.js';
import signInResets from './migrations/025-sign-in-resets.js';
import billing from './migrations/020-billing.js';
import agents from './migrations/026-agents.js';
import smartWalletBallots from './migrations/027-smart-wallet-ballots.js';
import tokenFees from './migrations/028-token-fees.js';
import passkeyWraps from './migrations/029-passkey-wraps.js';
import aiCredits from './migrations/030-ai-credits.js';
import tracesAndLimits from './migrations/031-traces-and-limits.js';

// Append new migrations to the end. Never edit one that has shipped.
// An object entry with `rebuild: true` runs with foreign keys off, which SQLite
// needs for table rebuilds; foreign keys are re-checked before committing.
const migrations = [initial, optionalEmail, identityAndProofs, walletOnly, noxBounties, holdersAndVotes, everyday, encryptedDocs, apiTokens, rewardTokens, sharing, publicBounties, plan, privacy, votePower, encryptedBallots, sealedTasks, sealedFiles, purgeIndexes, heldBallots, dueTimesPushFeeds, everydayTeams, signedKeys, signInResets, billing, agents, smartWalletBallots, tokenFees, passkeyWraps, aiCredits, tracesAndLimits];

export default migrations;
