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
import heldBallots from './migrations/020-held-ballots.js';
import dueTimesPushFeeds from './migrations/021-due-times-push-feeds.js';
import everydayTeams from './migrations/022-everyday-teams.js';
import signedKeys from './migrations/023-signed-keys.js';
import signInResets from './migrations/024-sign-in-resets.js';
import billing from './migrations/025-billing.js';
import agents from './migrations/026-agents.js';
import smartWalletBallots from './migrations/027-smart-wallet-ballots.js';
import tokenFees from './migrations/028-token-fees.js';
import passkeyWraps from './migrations/029-passkey-wraps.js';
import aiCredits from './migrations/030-ai-credits.js';
import tracesAndLimits from './migrations/031-traces-and-limits.js';
import privacyPools from './migrations/032-privacy-pools.js';
import signInHardening from './migrations/033-sign-in-hardening.js';
import lookupIndexes from './migrations/034-lookup-indexes.js';
import voteReview from './migrations/035-vote-review.js';
import laterLookupIndexes from './migrations/036-later-lookup-indexes.js';
import publicBallots from './migrations/037-public-ballots.js';
import publicVotes from './migrations/038-public-votes.js';
import overpaidCredit from './migrations/039-overpaid-credit.js';
import aiProvider from './migrations/040-ai-provider.js';
import docUpdates from './migrations/041-doc-updates.js';
import chat from './migrations/042-chat.js';
import sealedBlobsAndFiles from './migrations/043-sealed-blobs-and-files.js';
import docBlobRefs from './migrations/044-doc-blob-refs.js';
import docUpdateBytes from './migrations/045-doc-update-bytes.js';
import docKeyEpoch from './migrations/046-doc-key-epoch.js';
import filesRoundTwo from './migrations/047-files-round-two.js';
import chatDepartures from './migrations/048-chat-departures.js';
import keyHistory from './migrations/049-key-history.js';
import calls from './migrations/050-calls.js';
import docUpdateAuthors from './migrations/051-doc-update-authors.js';

// Append new migrations to the end. Never edit one that has shipped.
// An object entry with `rebuild: true` runs with foreign keys off, which SQLite
// needs for table rebuilds; foreign keys are re-checked before committing.
const migrations = [initial, optionalEmail, identityAndProofs, walletOnly, noxBounties, holdersAndVotes, everyday, encryptedDocs, apiTokens, rewardTokens, sharing, publicBounties, plan, privacy, votePower, encryptedBallots, sealedTasks, sealedFiles, purgeIndexes, heldBallots, dueTimesPushFeeds, everydayTeams, signedKeys, signInResets, billing, agents, smartWalletBallots, tokenFees, passkeyWraps, aiCredits, tracesAndLimits, privacyPools, signInHardening, lookupIndexes, voteReview, laterLookupIndexes, publicBallots, publicVotes, overpaidCredit, aiProvider, docUpdates, chat, sealedBlobsAndFiles, docBlobRefs, docUpdateBytes, docKeyEpoch, filesRoundTwo, chatDepartures, keyHistory, calls, docUpdateAuthors];

export default migrations;
