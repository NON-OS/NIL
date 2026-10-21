import net from 'node:net';
import addressCategory from './addressCategory.js';

// Where a tunnel may go: an allowed port, and a name whose every address is an ordinary public
// one, outside the operator's own deny list (the host's public addresses, say). Private ranges
// cover Docker's networks, so nothing on this host or its networks is reachable through it.
// Returns the address to connect to, the one checked here, or why not.
export default async function checkTarget({ host, port }, { allowPorts, deny }, resolve) {
  if (!allowPorts.includes(port)) return { refused: 'port' };
  let addresses;
  if (net.isIP(host)) addresses = [{ address: host, family: net.isIP(host) }];
  else {
    try {
      addresses = await resolve(host);
    } catch {
      return { refused: 'dns' };
    }
  }
  if (!addresses?.length) return { refused: 'dns' };
  for (const { address } of addresses) {
    const category = addressCategory(address);
    if (category) return { refused: category };
    if (deny.check(address, net.isIP(address) === 6 ? 'ipv6' : 'ipv4')) return { refused: 'denied' };
  }
  return { address: addresses[0].address, family: addresses[0].family };
}
