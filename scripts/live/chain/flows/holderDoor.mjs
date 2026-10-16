import assert from 'node:assert/strict';
import testWallet from '../testWallet.mjs';
import fundWallet from '../fundWallet.mjs';
import stakeNox from '../stakeNox.mjs';
import mainnet from '../mainnet.mjs';

const NOX = 10n ** 18n;
const DAY = 86_400_000;

// The token-holder door: a wallet that holds enough, counting NOX held, NOX staked and
// Zero-State Passes, joins without an invite. One that falls below gets the grace notice and
// keeps access through the grace period, is turned away after it, and comes back by holding
// enough again.
export default async function holderDoor(ctx) {
  const { chain, wallets } = ctx;
  const { owner } = ctx.people;
  const minimum = 100_000n * NOX;
  await owner.api.put('/holder-gate', { enabled: true, minimum: String(minimum) });
  const fresh = async (funds) => {
    const w = testWallet(chain.rpc);
    await fundWallet(chain, w.address, { eth: 10n ** 18n, ...funds });
    return w;
  };

  // short of the minimum
  await ctx.client().wallet(await fresh({ nox: 10_000n * NOX }), 'holder', { name: 'Nearly' }, { expect: 403 });

  // NOX held
  const holder = ctx.client();
  ctx.people.holder = { api: holder, id: (await holder.wallet(wallets.holder, 'holder', { name: 'Hana Holder' })).user.id, wallet: wallets.holder };
  // one Zero-State Pass counts as 100,000 NOX, and NOX staked counts like NOX held
  await ctx.client().wallet(await fresh({ passes: 1 }), 'holder', { name: 'Pia Pass' });
  const staked = await fresh({ nox: 100_000n * NOX });
  await stakeNox(chain, staked, 100_000n * NOX);
  await ctx.client().wallet(staked, 'holder', { name: 'Stella Stake' });

  // Hana moves 30,000 NOX away: signing in still works, with a notice about the grace period
  await chain.receipt(await wallets.holder.transfer(mainnet.nox, owner.wallet.address, 30_000n * NOX));
  const back = ctx.client();
  await back.wallet(wallets.holder, 'login');
  const notices = await back.get('/notifications');
  const low = notices.find((n) => n.type === 'holder_low');
  assert.ok(low, 'the member is told they fell below the minimum');

  // once the grace period has passed (moved back here rather than waited for), the door stays shut
  const db = await ctx.db();
  db.prepare('UPDATE users SET holder_below_since = ? WHERE id = ?').run(Date.now() - 4 * DAY, ctx.people.holder.id);
  db.close();
  await ctx.client().wallet(wallets.holder, 'login', {}, { expect: 403 });

  // holding enough again opens it
  await chain.receipt(await owner.wallet.transfer(mainnet.nox, wallets.holder.address, 30_000n * NOX));
  await ctx.client().wallet(wallets.holder, 'login');
}
