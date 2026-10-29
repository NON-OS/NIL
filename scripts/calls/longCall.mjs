// The calls check's long call (node scripts/calls/check.mjs --long): a call that runs past
// several relay passwords (TURN_TTL_SECONDS=60), and a network that changes under it. The
// change is real: the firewall drops this machine's UDP to the relay mid-call, the way a network
// that blocks UDP would, and the call has to find its way back over TCP, with a new address as
// the relay sees it. Needs root for iptables; without it, that part is left out and says so.
import { spawnSync } from 'node:child_process';
import setup from './setup.mjs';
import probes from './probes.mjs';

const { until, links, connected } = probes;
const RULE = (port) => ['OUTPUT', '-p', 'udp', '--dport', String(port), '-j', 'DROP'];
const firewall = (op, port) => spawnSync('iptables', [op, ...RULE(port)]).status === 0;

// every relay password a call used, from coturn's log
const passwords = (relay) => new Set([...relay.log().matchAll(/user <([0-9]+:[A-Za-z0-9_-]+)>/g)].map((m) => m[1]));

export default async function longCall({ app, relay, ada, ana, ben, check, shot }) {
  await setup({ app, ada, ana, ben });
  await until('Ana to be callable', () => ada.page.getByRole('button', { name: 'Call Ana', exact: true }).isEnabled());
  await ada.page.getByRole('button', { name: 'Call Ana', exact: true }).click();
  await ana.page.getByRole('button', { name: 'Answer Ada with sound only' }).click();
  await connected(ada.page, 1);
  await connected(ana.page, 1);
  check('a call starts on relay passwords that last a minute', true);

  // two and a half minutes: every password the call started with has run out twice over
  const started = Date.now();
  let dropped = 0;
  while (Date.now() - started < 150_000) {
    if (!(await links(ada.page)).some((l) => l.state === 'connected')) dropped += 1;
    await ada.page.waitForTimeout(2000);
  }
  const used = passwords(relay);
  check('the call outlives its relay passwords, on fresh ones', (await links(ada.page)).some((l) => l.state === 'connected') && used.size >= 4, `${used.size} passwords used, ${dropped} of 75 looks found it reconnecting`);

  // the network changes: UDP to the relay stops getting through
  const port = Number(new URL(relay.url.replace('turn:', 'turn://')).port);
  if (!firewall('-I', port)) {
    check('a network change (needs root for iptables)', true, 'left out: no iptables here');
    return;
  }
  try {
    const before = (await links(ada.page)).find((l) => l.state === 'connected');
    const flipped = Date.now();
    await until('the call to come back over TCP', async () => (await links(ada.page)).some((l) => l.state === 'connected' && l.via === 'tcp') && (await links(ana.page)).some((l) => l.state === 'connected'), 120_000);
    check('when UDP stops getting through, the call comes back over TCP', true, `${before?.via} to tcp in ${((Date.now() - flipped) / 1000).toFixed(1)} s`);
    await shot(ada.page, 'call-after-network-change');
  } finally {
    firewall('-D', port);
  }
  await ada.page.getByRole('button', { name: 'Leave the call' }).click();
}
