import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
// the top-level networks: section of a compose file, through to the next top-level key
const networks = (text) => text.slice(text.indexOf('\nnetworks:\n')).split(/\n(?=[a-z])/)[1];

test('the host’s Docker settings keep visitors’ IPv6 addresses and keep IPv6 away from workspaces', () => {
  const daemon = JSON.parse(read('deploy/host/docker-daemon.json'));
  assert.equal(daemon['userland-proxy'], false, 'the proxy would show every IPv6 visitor as one IPv4 address, and sign-ups count IPv6 per /56');
  assert.equal(daemon.ip6tables, true, 'with the proxy off, IPv6 ports are forwarded by ip6tables rules');
  assert.equal(daemon['default-network-opts'], undefined, 'no daemon default may turn on IPv6 for workspace networks');
  assert.ok(daemon['default-address-pools'].every((pool) => !pool.base.includes(':')), 'Docker picks the edge network’s ULA prefix itself');

  const hosted = networks(read('cloud/docker-compose.yml'));
  assert.match(hosted, /\n {2}edge:\n {4}enable_ipv6: true\n/, 'Caddy publishes its ports from the edge network');
  assert.match(hosted, /\n {2}chain:\n {4}internal: true\n/);
  assert.equal(hosted.match(/enable_ipv6/g).length, 1, 'only the edge network has IPv6');
  assert.match(networks(read('deploy/single/docker-compose.yml')), /\n {2}edge:\n {4}enable_ipv6: true\n/);
  for (const file of ['cloud/docker-compose.chain.yml', 'cloud/docker-compose.verifier.yml']) assert.doesNotMatch(read(file), /enable_ipv6/, file);
});
