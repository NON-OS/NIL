// Sets up a fresh Nil workspace for the agent checks and saves who is who to state.json:
// an owner and a member (wallet sign-in), two projects, a handful of real-looking tasks, and
// three agents: Scout (external, read and write, with a webhook), Reader (external, read only)
// and Helper (built in, on the local OpenAI-compatible model).
//
//   node bootstrap.js --state <run dir>/state.json [--webhook http://127.0.0.1:4700/nil] [--no-helper]
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import wallet from './lib/wallet.js';
import session from './lib/session.js';

const { values: opt } = parseArgs({
  options: {
    url: { type: 'string', default: process.env.NIL_URL ?? 'http://127.0.0.1:3917' },
    state: { type: 'string', default: process.env.LIVE_STATE },
    webhook: { type: 'string' },
    endpoint: { type: 'string', default: process.env.LOCAL_MODEL_URL ?? 'http://127.0.0.1:11434/v1' },
    model: { type: 'string', default: process.env.LOCAL_MODEL ?? 'local-agent' },
    // a server without local endpoints refuses an agent on a local model
    'no-helper': { type: 'boolean', default: process.env.NO_HELPER === '1' },
  },
});

const must = (res, what) => {
  if (res.status >= 300) throw new Error(`${what}: HTTP ${res.status} ${JSON.stringify(res.data)}`);
  return res.data;
};

const ownerWallet = wallet();
const anaWallet = wallet();
const owner = session(opt.url);
const ana = session(opt.url);

must(await owner.signIn(ownerWallet, 'setup', { name: 'Erik Lind', workspaceName: 'NØNOS', setupToken: process.env.SETUP_TOKEN ?? 'agents-check-setup-token-0001' }), 'owner setup');
const invite = must(await owner('POST', '/api/invites', { role: 'member' }), 'invite');
must(await ana.signIn(anaWallet, 'invite', { name: 'Ana Park', inviteToken: invite.token }), 'member joins');

const me = must(await owner('GET', '/api/bootstrap'), 'bootstrap').me;
const anaMe = must(await ana('GET', '/api/bootstrap'), 'bootstrap').me;
const alpha = must(await owner('POST', '/api/projects', { name: 'Website', color: '#3b4fe0' }), 'project').project;
const beta = must(await owner('POST', '/api/projects', { name: 'Finance', color: '#0e9384' }), 'project').project;
const bug = must(await owner('POST', '/api/labels', { name: 'bug', color: '#d92d20' }), 'label').label;

const tasks = {};
const add = async (name, who, body) => {
  tasks[name] = must(await who('POST', '/api/tasks', body), `task ${name}`).task;
};
await add('launchPage', owner, {
  title: 'Write the launch page copy',
  description: 'We launch on Wednesday 21 October. The page needs a headline, three short feature blurbs (tasks, private notes, agents) and a call to action. Keep it under 200 words.',
  projectId: alpha.id,
  priority: 3,
  checklist: [{ text: 'Headline' }, { text: 'Three feature blurbs' }, { text: 'Call to action' }],
});
await add('loginBug', ana, {
  title: 'Login button does nothing on Safari 18',
  description: 'Clicking "Connect wallet" on Safari 18.1 (macOS) does nothing. No error in the console. Chrome and Firefox work. Reported by two users this morning.',
  projectId: alpha.id,
  labels: [bug.id],
  priority: 2,
});
await add('cacheQuestion', ana, {
  title: 'How long do we cache the project list?',
  description: 'Support asked how long the project list stays cached in the browser after someone is removed from a project.',
  projectId: alpha.id,
});
await add('migration', owner, {
  title: 'Move image uploads to the new storage bucket',
  description: 'Old uploads live in /var/data/uploads. Copy them to the new bucket, switch the upload path, and keep the old folder for a week.',
  projectId: alpha.id,
  priority: 2,
});
await add('budget', owner, { title: 'Q4 budget review', description: 'Numbers for the board. Only finance works on this.', projectId: beta.id });

const options = must(await owner('GET', '/api/agents'), 'agent options').options;
const allTools = options.tools.map((t) => t.name);

const scout = must(
  await owner('POST', '/api/agents', {
    name: 'Scout',
    color: '#7c4ddb',
    description: 'Triages bugs and drafts plans.',
    instructions: 'Keep comments short. Ask for steps to reproduce when a bug report has none.',
    access: 'write',
    projectIds: [alpha.id],
    tools: allTools,
    runner: 'external',
    // the checks call fast; the rate limit gets its own agent in rest-check.js
    rateLimit: 1000,
  }),
  'create Scout',
);
const reader = must(
  await owner('POST', '/api/agents', { name: 'Reader', color: '#0e9384', access: 'read', projectIds: [alpha.id], runner: 'external' }),
  'create Reader',
);
const helper = opt['no-helper'] ? { agent: { id: null }, key: null } : must(
  await owner('POST', '/api/agents', {
    name: 'Helper',
    color: '#c4320a',
    description: 'Plans work and answers questions on tasks.',
    instructions: 'Be concrete. When you split work into steps, add them to the checklist.',
    access: 'write',
    projectIds: [alpha.id],
    runner: 'openai',
    endpoint: opt.endpoint,
    model: opt.model,
  }),
  'create Helper',
);

let webhookSecret = null;
if (opt.webhook && opt.webhook !== 'none') {
  webhookSecret = must(await owner('PUT', `/api/agents/${scout.agent.id}/webhook`, { url: opt.webhook }), 'webhook').secret;
}

const state = {
  url: opt.url,
  people: {
    owner: { id: me.id, name: me.name, privateKey: ownerWallet.privateKey, cookie: owner.cookie() },
    ana: { id: anaMe.id, name: anaMe.name, privateKey: anaWallet.privateKey, cookie: ana.cookie() },
  },
  projects: { website: alpha.id, finance: beta.id },
  labels: { bug: bug.id },
  tasks: Object.fromEntries(Object.entries(tasks).map(([k, t]) => [k, { id: t.id, key: `NON-${t.number}`, number: t.number }])),
  agents: {
    scout: { id: scout.agent.id, key: scout.key, webhookSecret, webhook: webhookSecret ? opt.webhook : null },
    reader: { id: reader.agent.id, key: reader.key },
    helper: { id: helper.agent.id, key: helper.key ?? null },
  },
};
fs.writeFileSync(opt.state, JSON.stringify(state, null, 2));
console.log(`Workspace ready at ${opt.url}. State in ${opt.state}`);
console.log(JSON.stringify({ tasks: state.tasks, agents: Object.fromEntries(Object.entries(state.agents).map(([k, a]) => [k, a.id])) }, null, 2));
