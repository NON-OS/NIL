// Every MCP tool, called through the official MCP TypeScript SDK with agent keys, plus the
// refusals that matter: a read-only agent, a wrong key, a task outside the agent's projects.
//
//   node mcpCheck.js [--sdk v2|v1]
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import mcpConnect from './lib/mcpConnect.js';
import checks from './lib/checks.js';

const { values: opt } = parseArgs({
  options: {
    sdk: { type: 'string', default: 'v2' },
    state: { type: 'string', default: process.env.LIVE_STATE },
  },
});
const state = JSON.parse(fs.readFileSync(opt.state, 'utf8'));
const url = `${state.url}/mcp`;
const t = checks(`MCP over the official SDK (${opt.sdk})`);

const scout = await mcpConnect(url, state.agents.scout.key, { sdk: opt.sdk });
const info = scout.getServerVersion();
t.ok(info?.name === 'nonos', 'initialize: server identifies itself', JSON.stringify(info));
t.ok(/agent "Scout"/.test(scout.getInstructions() ?? ''), 'initialize: instructions name the agent');

const { tools } = await scout.listTools();
const names = tools.map((x) => x.name);
t.ok(names.length === 21, 'tools/list: Scout sees all 21 tools it was given', names.join(','));
t.ok(tools.every((x) => x.inputSchema?.type === 'object'), 'tools/list: every tool has an object input schema');
t.ok(tools.find((x) => x.name === 'delete_task')?.annotations?.destructiveHint === true, 'tools/list: delete_task is marked destructive');

const call = async (name, args = {}) => {
  const res = await scout.callTool({ name, arguments: args });
  return { res, data: res.structuredContent, text: res.content?.map((c) => c.text).join('\n') ?? '' };
};
const tk = state.tasks;
const seen = new Set();
const run = async (name, args, expect, what) => {
  seen.add(name);
  const out = await call(name, args);
  t.ok(expect(out), `${name}: ${what}`, out.res.isError ? out.text : JSON.stringify(out.data)?.slice(0, 200));
  return out;
};

await run('whoami', {}, ({ data }) => data?.kind === 'agent' && data.projects?.includes('Website'), 'reports an agent in Website');
await run('workspace_summary', {}, ({ data }) => typeof data?.open === 'number', 'counts tasks');
await run('list_projects', {}, ({ data }) => data?.projects?.map((p) => p.name).join() === 'Website', 'only its own project');
await run('list_labels', {}, ({ data }) => data?.labels?.some((l) => l.name === 'bug'), 'lists labels');
await run('list_people', {}, ({ data }) => (data?.people ?? []).length > 0, 'lists people');
await run('list_goals', {}, ({ data }) => Array.isArray(data?.goals), 'lists goals');
await run('list_tasks', {}, ({ data }) => data?.tasks?.some((x) => x.key === tk.loginBug.key) && !data.tasks.some((x) => x.key === tk.budget.key), 'Website tasks only, not Finance');
await run('search_tasks', { query: 'Safari' }, ({ data }) => data?.tasks?.[0]?.key === tk.loginBug.key, 'finds the Safari bug');
const created = await run('create_task', { title: `Draft FAQ for launch ${Date.now()}`, project: 'Website', checklist: ['Pricing', 'Privacy'] }, ({ data }) => Boolean(data?.created?.key), 'creates a task in its project');
const mine = created.data?.created?.key;
const fresh = await run('get_task', { key: mine }, ({ data }) => data?.checklist?.length === 2 && data.checklist.every((i) => i.id), 'reads the checklist with item ids');
await run('get_task', { key: tk.budget.key }, ({ res }) => res.isError === true, 'refuses a task outside its projects');
await run('claim_task', { key: mine }, ({ data }) => data?.claimed?.key === mine && data.claimed.status === 'in_progress', 'claims an unassigned task and starts it');
await run('my_assignments', {}, ({ data }) => data?.tasks?.some((x) => x.key === mine), 'shows the claimed task');
await run('update_task', { key: mine, checklistTick: [fresh.data?.checklist?.[0]?.id], checklistAdd: ['Check the copy with Ana'] }, ({ data }) => data?.changed === true && data.updated.checklist.length === 3 && data.updated.checklist[0].done, 'ticks an item and adds one');
await run('add_comment', { key: tk.loginBug.key, text: 'Can you share the Safari version and whether a wallet extension is installed?' }, ({ data }) => Boolean(data?.commentId), 'posts a comment');
await run('watch_task', { key: tk.migration.key, watching: true }, ({ data }) => data?.watching === true, 'starts watching');
await run('my_inbox', {}, ({ data }) => Array.isArray(data?.items), 'reads the inbox');
await run('mark_inbox_read', { all: true }, ({ data }) => data?.unread === 0, 'marks everything read');
await run('start_time_entry', { key: mine, note: 'FAQ draft' }, ({ data }) => Boolean(data?.running), 'starts its timer');
await run('stop_time_entry', {}, ({ res }) => !res.isError, 'stops its timer');
const parked = await run('delete_task', { key: mine }, ({ data }) => data?.status === 'pending_approval', 'waits for approval instead of deleting');
await run('get_approval', { id: parked.data?.approval?.id ?? 'none' }, ({ data }) => data?.status === 'pending', 'reports the request as pending');
t.ok(names.every((n) => seen.has(n)), 'every listed tool was called', names.filter((n) => !seen.has(n)).join(','));

const unknown = await scout.callTool({ name: 'drop_database', arguments: {} }).then(() => null, (err) => err);
t.ok(unknown && /Unknown tool/.test(unknown.message), 'an unknown tool is a protocol error', unknown?.message);
await scout.close();

const reader = await mcpConnect(url, state.agents.reader.key, { sdk: opt.sdk });
const readerTools = (await reader.listTools()).tools.map((x) => x.name);
t.ok(!readerTools.includes('update_task') && readerTools.includes('get_task'), 'Reader lists read tools only', readerTools.join(','));
const refused = await reader.callTool({ name: 'add_comment', arguments: { key: tk.loginBug.key, text: 'hi' } });
t.ok(refused.isError && /read-only/.test(refused.content[0].text), 'Reader is refused a write', refused.content?.[0]?.text);
await reader.close();

const bad = await mcpConnect(url, 'nonos_agt_wrong', { sdk: opt.sdk }).then(() => null, (err) => err);
t.ok(bad && (bad.data?.status ?? bad.code) === 401, 'a wrong key cannot connect: HTTP 401', bad?.message);

t.done();
