import assert from 'node:assert/strict';
import testWallet from '../testWallet.mjs';
import fundWallet from '../fundWallet.mjs';
import stakeNox from '../stakeNox.mjs';
import waitFor from '../waitFor.mjs';
import mainnet from '../mainnet.mjs';

const NOX = 10n ** 18n;
const DAY = 86_400_000;

// The token-holder door: a wallet that holds enough in the newest final block, counting NOX
// held, NOX staked and Zero-State Passes, joins without an invite. One that falls below gets the
// grace notice and keeps access through the grace period, is turned away after it, and comes back
// once the scheduled checks have seen it holding enough again for a while.
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
  const join = (w, name, opts) => ctx.client().wallet(w, 'holder', { name }, opts);

  const nearly = await fresh({ nox: 10_000n * NOX });
  // one Zero-State Pass counts as 100,000 NOX, and NOX staked counts like NOX held
  const pass = await fresh({ passes: 1 });
  const staked = await fresh({ nox: 100_000n * NOX });
  await stakeNox(chain, staked, 100_000n * NOX);

  // what arrived in blocks that aren't final yet doesn't count
  await join(pass, 'Pia Pass', { expect: 403 });
  await chain.finalize();

  await join(nearly, 'Nearly', { expect: 403 });
  const holder = ctx.client();
  ctx.people.holder = { api: holder, id: (await holder.wallet(wallets.holder, 'holder', { name: 'Hana Holder' })).user.id, wallet: wallets.holder };
  await join(pass, 'Pia Pass');
  await join(staked, 'Stella Stake');

  // Hana moves 30,000 NOX away: once that's final, signing in still works, with a notice about
  // the grace period
  await chain.receipt(await wallets.holder.transfer(mainnet.nox, owner.wallet.address, 30_000n * NOX));
  await chain.finalize();
  const back = ctx.client();
  await back.wallet(wallets.holder, 'login');
  const notices = await back.get('/notifications');
  const low = notices.find((n) => n.type === 'holder_low');
  assert.ok(low, 'the member is told they fell below the minimum');

  // the dates below are moved in Nil's database rather than waited for
  const db = await ctx.db();
  const hana = ctx.people.holder.id;
  try {
    // once the grace period has passed, the door stays shut
    db.prepare('UPDATE users SET holder_below_since = ? WHERE id = ?').run(Date.now() - 4 * DAY, hana);
    await ctx.client().wallet(wallets.holder, 'login', {}, { expect: 403 });

    // Holding enough again doesn't open it at sign-in. Only a scheduled check, which reads every
    // holder at one block, can see her back, and she's let in once those checks have seen it for
    // the recheck window. Her check is made due now, and the window moved back after it.
    await chain.receipt(await owner.wallet.transfer(mainnet.nox, wallets.holder.address, 30_000n * NOX));
    await chain.finalize();
    const early = await ctx.client().wallet(wallets.holder, 'login', {}, { expect: 403 });
    assert.match(early.error, /hold enough again/);
    db.prepare('UPDATE users SET holder_checked_at = NULL WHERE id = ?').run(hana);
    await waitFor(() => db.prepare('SELECT holder_held_since FROM users WHERE id = ?').get(hana).holder_held_since, { what: 'a scheduled check to see Hana holding enough' });
    db.prepare('UPDATE users SET holder_held_since = ? WHERE id = ?').run(Date.now() - DAY, hana);
    await ctx.client().wallet(wallets.holder, 'login');
  } finally {
    db.close();
  }
}
