import express from 'express';
import requireAuth from '../auth/requireAuth.js';
import requireMember from '../auth/requireMember.js';
import requirePlan from '../auth/requirePlan.js';
import storageGuard from '../security/storageGuard.js';
import cryptoGate from '../auth/cryptoGate.js';
import auth from './auth.js';
import wallet from './wallet.js';
import credentials from './credentials.js';
import proofKey from './proofKey.js';
import proofs from './proofs.js';
import capsules from './capsules.js';
import privacy from './privacy.js';
import bootstrap from './bootstrap.js';
import me from './me.js';
import workspace from './workspace.js';
import users from './users.js';
import invites from './invites.js';
import projects from './projects.js';
import labels from './labels.js';
import goals from './goals.js';
import tasks from './tasks.js';
import taskArchive from './taskArchive.js';
import comments from './comments.js';
import attachments from './attachments.js';
import focus from './focus.js';
import notifications from './notifications.js';
import activity from './activity.js';
import exportRoutes from './exports.js';
import ai from './ai.js';
import bounties from './bounties.js';
import proposals from './proposals.js';
import holderGate from './holderGate.js';
import time from './time.js';
import reminders from './reminders.js';
import docs from './docs.js';
import docUpdates from './docUpdates.js';
import docMentions from './docMentions.js';
import encryptionKeys from './encryptionKeys.js';
import identityWraps from './identityWraps.js';
import passkeyWraps from './passkeyWraps.js';
import tokens from './tokens.js';
import shareLinks from './shareLinks.js';
import publicPages from './publicPages.js';
import publicBounties from './publicBounties.js';
import publicVotes from './publicVotes.js';
import applications from './applications.js';
import planRoutes from './plan.js';
import stealth from './stealth.js';
import pools from './pools.js';
import poolPayouts from './poolPayouts.js';
import poolAccount from './poolAccount.js';
import anonymousBallots from './anonymousBallots.js';
import aiCredits from './aiCredits.js';
import aiCreditInfo from './aiCreditInfo.js';
import aiProviderRoutes from './aiProvider.js';
import votingKey from './votingKey.js';
import trustees from './trustees.js';
import shareChecks from './shareChecks.js';
import push from './push.js';
import calendarFeed from './calendarFeed.js';
import calendarFeedSettings from './calendarFeedSettings.js';
import search from './search.js';
import firstRun from './firstRun.js';
import resetLinks from './resetLinks.js';
import signInResets from './signInResets.js';
import agentRoutes from './agentRoutes.js';

const api = express.Router();

api.use(auth);
// Workspaces with the crypto tools off answer 404 on their routes, signed in or not.
api.use(cryptoGate);
api.use(publicPages);
api.use(publicBounties);
api.use(publicVotes);
api.use(wallet);
api.use(resetLinks);
api.use(proofKey);
api.use(capsules);
api.use(anonymousBallots);
api.use(aiCredits);
// calendar apps open a person's feed with its secret link alone, never a cookie
api.use(calendarFeed);

// Everything after this line needs a signed-in, active account.
api.use(requireAuth);
// and new writes only while the workspace's storage has room
api.use(storageGuard);

// Guests stay inside the projects shared with them: workspace-wide features are for members.
api.use(['/proposals', '/vote-power', '/me/semaphore', '/docs', '/encryption-keys', '/me/encryption-key', '/me/identity-wraps', '/me/recovery-kit', '/me/passkeys', '/holder-gate', '/bounties/treasury', '/ai/brief', '/ai/extract', '/share-links'], requireMember);
// The subscription unlocks opening votes, the holder door and every AI feature.
api.use(['/ai', '/holder-gate'], (req, res, next) => (req.method === 'GET' ? next() : requirePlan(req, res, next)));
// Only opening a vote is gated. Any vote that exists was opened while the paid tools were
// unlocked, so after a lapse its ballots, trustee setup, closing and the partial decryptions
// that reveal its totals keep working: billing never leaves a vote stuck halfway.
api.post('/proposals', requirePlan);
api.use(['/projects', '/goals', '/labels', '/sharing'], (req, res, next) => (req.method === 'GET' ? next() : requireMember(req, res, next)));
for (const router of [bootstrap, me, credentials, proofs, privacy, workspace, users, invites, projects, labels, goals, taskArchive, tasks, comments, attachments, focus, notifications, activity, exportRoutes, ai, bounties, proposals, holderGate, time, reminders, docs, docUpdates, docMentions, encryptionKeys, identityWraps, passkeyWraps, tokens, shareLinks, applications, planRoutes, stealth, pools, poolPayouts, poolAccount, votingKey, trustees, shareChecks, push, calendarFeedSettings, search, firstRun, signInResets, agentRoutes, aiCreditInfo, aiProviderRoutes]) {
  api.use(router);
}

api.use((req, res) => res.status(404).json({ error: 'Unknown API route.' }));

export default api;
