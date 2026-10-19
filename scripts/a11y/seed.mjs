// Sets up a workspace the way a new owner does, through the setup screen and their wallet, then
// adds what the checked screens show: a project, tasks on every column, a listed bounty and
// votes of each kind. Leaves the owner signed in on the page and returns the ids it made.

const TASKS = [
  ['Write the launch post', 'todo'],
  ['Fix the sign-in copy', 'in_progress'],
  ['Check the relay logs', 'in_review'],
  ['Ship 3.1', 'done'],
];
// 250 NOX, in the token's smallest unit as the API takes it
const BOUNTY = { title: 'Translate the help pages', amount: `250${'0'.repeat(18)}` };
// one of each kind a member meets: signed with public ballots (and one cast, so the list has a
// row), anonymous, sealed until it closes, and closed
const VOTES = [
  { title: 'Move the weekly call to Thursday?', body: 'Thursday suits the people in Asia better.', options: ['Yes', 'No'], days: 7, publicBallots: true, cast: 0 },
  { title: 'Pick the offsite city', options: ['Lisbon', 'Porto', 'Madeira'], days: 7, anonymous: true },
  { title: 'Raise the bounty budget?', options: ['Yes', 'No'], days: 7, sealed: true },
  { title: 'Adopt the new label set?', options: ['Yes', 'No'], days: 3, close: true },
];

export const api = (page, method, url, body) =>
  page.evaluate(
    async ([m, u, b]) => {
      const res = await fetch(`/api${u}`, { method: m, headers: { 'Content-Type': 'application/json', 'X-NONOS': '1' }, body: b ? JSON.stringify(b) : undefined });
      if (!res.ok) throw new Error(`${m} ${u}: ${res.status} ${await res.text()}`);
      return res.json();
    },
    [method, url, body],
  );

// A signed ballot, the way the app casts one: the server writes the text, the page's wallet signs.
const signBallot = async (page, id, choice) => {
  const { ballotId, message } = await api(page, 'POST', `/proposals/${id}/ballot`, { choice });
  const signature = await page.evaluate(async (text) => {
    const [address] = await window.ethereum.request({ method: 'eth_accounts' });
    const hex = `0x${[...new TextEncoder().encode(text)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
    return window.ethereum.request({ method: 'personal_sign', params: [hex, address] });
  }, message);
  await api(page, 'POST', `/proposals/${id}/vote`, { ballotId, signature });
};

export default async function seed(page, world) {
  await page.goto(world.base);
  await page.getByLabel('Setup token').fill(world.setupToken);
  await page.getByLabel('Workspace name').fill('Northwind');
  await page.getByLabel('Your name').fill('Ada');
  await page.getByText('Crypto team').click();
  await page.getByRole('button', { name: 'Create workspace with your wallet' }).click();
  await page.locator('.view-head h1').waitFor();

  const me = (await api(page, 'GET', '/bootstrap')).me.id;
  const project = (await api(page, 'POST', '/projects', { name: 'Launch', color: '#007c85' })).project.id;
  const today = new Date().toISOString().slice(0, 10);
  for (const [title, status] of TASKS) await api(page, 'POST', '/tasks', { title, status, projectId: project, assigneeId: me, dueDate: today });
  const { task } = await api(page, 'POST', '/tasks', { title: BOUNTY.title, status: 'todo', projectId: project });
  await api(page, 'PATCH', `/tasks/${task.id}`, { bounty: BOUNTY.amount });
  await api(page, 'PATCH', `/tasks/${task.id}`, { listed: true });
  for (const { close, cast, ...vote } of VOTES) {
    const { proposal } = await api(page, 'POST', '/proposals', vote);
    if (cast !== undefined) await signBallot(page, proposal.id, cast);
    if (close) await api(page, 'POST', `/proposals/${proposal.id}/close`);
  }
  return { me, project };
}
