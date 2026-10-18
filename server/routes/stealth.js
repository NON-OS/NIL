import express from 'express';
import sql from '../db/sql.js';
import config from '../config.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import requireAdmin from '../auth/requireAdmin.js';
import rateLimit from '../auth/rateLimit.js';
import parseMeta from '../stealth/parseMeta.js';
import rawTransaction from '../chain/rawTransaction.js';
import feeQuote from '../chain/feeQuote.js';
import nodeReady from '../chain/nodeReady.js';
import rpc from '../chain/rpc.js';
import publishUser from '../services/publishUser.js';
import stealthPayouts from '../services/stealthPayouts.js';
import stealthBalances from '../services/stealthBalances.js';
import rewardToken from '../lib/rewardToken.js';
import checkAnnouncement from '../services/checkAnnouncement.js';
import toUser from '../mappers/toUser.js';
import toPayment from '../mappers/toPayment.js';

const router = express.Router();
const ADDRESS = /^0x[0-9a-f]{40}$/;
const TX = /^0x[0-9a-f]{64}$/;
const HEX = /^0x([0-9a-f]{2})*$/;
const relayLimit = rateLimit({ windowMs: 60_000, max: 20, key: (req) => req.user.id, message: 'Too many transactions at once. Wait a minute.' });

function needChain() {
  if (!config.nox.enabled) throw HttpError.badRequest('On-chain features are off on this server.');
}

function ownAddress(req, value) {
  const address = String(value ?? '').toLowerCase();
  if (!ADDRESS.test(address) || !stealthPayouts.addresses(req.user.id).has(address)) throw HttpError.forbidden('That isn’t one of your private payout addresses.');
  return address;
}

// The public half of your stealth keys. Payers derive a fresh address from it for every payout.
router.put(
  '/me/stealth',
  route((req) => {
    const meta = String(req.body?.metaAddress ?? '').trim().toLowerCase();
    parseMeta(meta);
    sql.run('UPDATE users SET stealth_meta = ? WHERE id = ?', meta, req.user.id);
    return { user: toUser(publishUser(req.user.id), req.viewer) };
  }),
);

router.delete(
  '/me/stealth',
  route((req) => {
    sql.run('UPDATE users SET stealth_meta = NULL WHERE id = ?', req.user.id);
    return { user: toUser(publishUser(req.user.id), req.viewer) };
  }),
);

router.get(
  '/stealth/payouts',
  route((req) => {
    needChain();
    return { payouts: stealthPayouts.list(req.user.id) };
  }),
);

// One payout's balance read now, for a payee about to move it. One address per request, so a
// payee checking several still never sends them to the node together.
router.get(
  '/stealth/payouts/:id/balance',
  relayLimit,
  route(async (req) => {
    needChain();
    const row = sql.get("SELECT to_address, token FROM payments WHERE id = ? AND payee_id = ? AND stealth_ephemeral IS NOT NULL AND status != 'failed'", req.params.id, req.user.id);
    if (!row) throw HttpError.notFound('That private payout');
    const held = await stealthBalances.now(row.to_address, rewardToken(row.token).address);
    if (!held) throw new HttpError(502, 'Nil couldn’t read that balance from its Ethereum node. Try again in a minute.');
    return { balance: { eth: held.eth, token: held.token }, checkedAt: held.checkedAt };
  }),
);

// Everything a browser needs to sign a transaction from one of your one-time addresses.
router.post(
  '/stealth/prepare',
  relayLimit,
  route(async (req) => {
    needChain();
    const from = ownAddress(req, req.body?.from);
    const to = String(req.body?.to ?? '').toLowerCase();
    const data = String(req.body?.data ?? '0x').toLowerCase();
    const value = String(req.body?.value ?? '0');
    if (!ADDRESS.test(to) || !HEX.test(data) || !/^\d+$/.test(value)) throw HttpError.badRequest('That transaction is malformed.');
    await nodeReady();
    const [nonce, balance, gas, fees] = await Promise.all([
      rpc('eth_getTransactionCount', [from, 'pending']),
      rpc('eth_getBalance', [from, 'latest']),
      rpc('eth_estimateGas', [{ from, to, data, value: `0x${BigInt(value).toString(16)}` }]),
      feeQuote(),
    ]);
    // a quarter more gas than estimated: token contracts with fee logic vary between calls
    const limit = (BigInt(gas) * 5n) / 4n;
    return {
      chainId: config.nox.chainId,
      nonce: Number(BigInt(nonce)),
      gas: limit.toString(),
      maxFeePerGas: fees.maxFeePerGas.toString(),
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas.toString(),
      balance: BigInt(balance).toString(),
    };
  }),
);

// Relays a transaction your browser signed, but only from your own one-time addresses: the
// server is not an open relay, and it never sees the key that signed.
router.post(
  '/stealth/broadcast',
  relayLimit,
  route(async (req) => {
    needChain();
    const tx = rawTransaction(req.body?.raw);
    ownAddress(req, tx.from);
    if (tx.chainId !== config.nox.chainId) throw HttpError.badRequest('That transaction is for a different network.');
    await nodeReady();
    const hash = await rpc('eth_sendRawTransaction', [req.body.raw]);
    return { txHash: typeof hash === 'string' ? hash.toLowerCase() : tx.hash };
  }),
);

// If the announcement failed or was never sent, the payer can attach a new one.
router.post(
  '/payments/:id/announce',
  requireAdmin,
  route(async (req) => {
    const row = sql.get('SELECT * FROM payments WHERE id = ?', req.params.id);
    if (!row?.stealth_ephemeral) throw HttpError.notFound('That private payout');
    // announcing from a team wallet would link it to a payout the pool kept apart from it
    if (row.via === 'pool') throw HttpError.badRequest('A payout from the team’s pool isn’t announced, since the announcement would come from a team wallet.');
    const hash = String(req.body?.txHash ?? '').trim().toLowerCase();
    if (!TX.test(hash)) throw HttpError.badRequest('That doesn’t look like a transaction hash.');
    if (!row.announced_at) sql.run('UPDATE payments SET announce_tx = ? WHERE id = ?', hash, row.id);
    await checkAnnouncement(row.id).catch(() => {});
    return { payment: toPayment(sql.get('SELECT * FROM payments WHERE id = ?', row.id)) };
  }),
);

export default router;
