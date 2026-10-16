import calls from './calls.mjs';
import mainnet from './mainnet.mjs';

const ETHER = 10n ** 18n;
const PASS_SUPPLY = 374;
let passIds = null;

const balance = async (chain, token, owner) => BigInt(await chain.rpc('eth_call', [{ to: token, data: calls.balanceOf(owner) }, 'latest']));

async function holderWith(chain, token, holders, amount) {
  for (const holder of holders) if ((await balance(chain, token, holder)) >= amount) return holder;
  // NOX can also come out of the staking contract: a real staker unstakes it first
  if (token === mainnet.nox) {
    for (const staker of mainnet.holders.noxStakers) {
      await chain.setBalance(staker, ETHER);
      const out = await chain.receipt(await chain.as(staker, { to: mainnet.staking, data: calls.unstake(amount) }));
      if (out.status === '0x1') return staker;
    }
  }
  throw new Error(`None of the listed holders of ${token} has ${amount} left. Add one to mainnet.mjs.`);
}

// Every pass and its owner, found once by asking ownerOf for each id, the listed holders' first.
// Any owner will do on a fork; the listed ones are just the likeliest to be ordinary wallets.
async function heldPasses(chain) {
  if (passIds) return passIds;
  const listed = new Set(mainnet.holders.zsp);
  passIds = [];
  for (let id = 0; id <= PASS_SUPPLY; id++) {
    const owner = await chain.rpc('eth_call', [{ to: mainnet.zsp, data: calls.ownerOf(id) }, 'latest']).catch(() => null);
    if (owner && BigInt(owner)) passIds.push({ id, owner: `0x${owner.slice(-40)}` });
  }
  passIds.sort((a, b) => Number(listed.has(b.owner)) - Number(listed.has(a.owner)));
  return passIds;
}

// Gives a test wallet ETH for gas and real NOX, USDC and Zero-State Passes, moved by real
// holders through the real token contracts, so balances, events and any transfer rules are
// exactly what mainnet would produce.
export default async function fundWallet(chain, to, { eth = ETHER, nox = 0n, usdc = 0n, passes = 0 } = {}) {
  if (eth) await chain.setBalance(to, eth);
  const receipts = [];
  for (const [token, holders, amount] of [[mainnet.nox, mainnet.holders.nox, nox], [mainnet.usdc, mainnet.holders.usdc, usdc]]) {
    if (!amount) continue;
    const from = await holderWith(chain, token, holders, amount);
    await chain.setBalance(from, ETHER);
    receipts.push(await chain.receipt(await chain.as(from, { to: token, data: calls.transfer(to, amount) })));
  }
  for (let i = 0; i < passes; i++) {
    const pass = (await heldPasses(chain)).shift();
    if (!pass) throw new Error('No Zero-State Pass left among the listed holders.');
    await chain.setBalance(pass.owner, ETHER);
    receipts.push(await chain.receipt(await chain.as(pass.owner, { to: mainnet.zsp, data: calls.transferFrom(pass.owner, to, pass.id) })));
  }
  for (const r of receipts) if (r.status !== '0x1') throw new Error(`Funding transaction ${r.transactionHash} reverted.`);
  return receipts;
}
