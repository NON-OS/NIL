import express from 'express';
import requireAuth from '../auth/requireAuth.js';
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
import encryptionKeys from './encryptionKeys.js';

const api = express.Router();

api.use(auth);
api.use(wallet);
api.use(proofKey);
api.use(capsules);

// Everything after this line needs a signed-in, active account.
api.use(requireAuth);
for (const router of [bootstrap, me, credentials, proofs, privacy, workspace, users, invites, projects, labels, goals, tasks, comments, attachments, focus, notifications, activity, exportRoutes, ai, bounties, proposals, holderGate, time, reminders, docs, encryptionKeys]) {
  api.use(router);
}

api.use((req, res) => res.status(404).json({ error: 'Unknown API route.' }));

export default api;
