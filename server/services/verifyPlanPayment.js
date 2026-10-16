import sql from '../db/sql.js';
import config from '../config.js';
import readTransfer from '../chain/readTransfer.js';
import treasury from './treasury.js';
import plan from './plan.js';
import hub from '../realtime/hub.js';
import guestScope from './guestScope.js';

const DAY = 86_400_000;

function fail(payment, problem) {
  sql.run("UPDATE plan_payments SET status = 'failed', problem = ?, checked_at = ? WHERE id = ? AND status = 'pending'", problem, Date.now(), payment.id);
}

// Checks a subscription payment: NOX from an admin's wallet or a team treasury address to the
// NØNOS treasury, buried under enough blocks. Each full price paid buys one period.
export default async function verifyPlanPayment(id) {
  const payment = sql.get('SELECT * FROM plan_payments WHERE id = ?', id);
  if (payment?.status !== 'pending') return;
  const found = await readTransfer(payment.tx_hash, config.nox.token);
  if (found.state === 'unknown') {
    if (Date.now() - payment.created_at > DAY) fail(payment, 'The transaction never showed up on-chain.');
    else sql.run('UPDATE plan_payments SET checked_at = ? WHERE id = ?', Date.now(), id);
    return;
  }
  if (found.state === 'failed') return fail(payment, `The transaction failed on-chain, so no ${config.nox.symbol} moved.`);

  const admins = sql.all("SELECT c.external_id FROM credentials c JOIN users u ON u.id = c.user_id WHERE c.kind = 'wallet' AND u.role IN ('owner', 'admin')").map((r) => r.external_id.toLowerCase());
  const payers = new Set([...admins, ...treasury.get()]);
  const toTreasury = found.transfers.filter((t) => t.to === config.plan.treasury);
  const funded = toTreasury.filter((t) => payers.has(t.from));
  if (!toTreasury.length) return fail(payment, `This transaction has no ${config.nox.symbol} transfer to the NØNOS treasury.`);
  if (!funded.length) return fail(payment, `The ${config.nox.symbol} came from a wallet that isn’t an admin’s or a team treasury address.`);
  const total = funded.reduce((sum, t) => sum + t.value, 0n);
  const periods = Number(total / BigInt(config.plan.price));
  if (periods < 1) return fail(payment, `Less ${config.nox.symbol} was sent than one period costs.`);
  if (found.confirmations < config.nox.confirmations) {
    sql.run('UPDATE plan_payments SET block_number = ?, checked_at = ? WHERE id = ?', found.blockNumber, Date.now(), id);
    return;
  }

  const counted = Math.min(periods, config.plan.maxPeriods);
  const { changes } = sql.run(
    "UPDATE plan_payments SET status = 'confirmed', amount = ?, periods = ?, from_address = ?, block_number = ?, confirmed_at = ?, checked_at = ? WHERE id = ? AND status = 'pending'",
    String(total), counted, funded[0].from, found.blockNumber, Date.now(), Date.now(), id,
  );
  if (changes) {
    plan.extend(counted);
    const event = { type: 'plan', plan: plan.status() };
    hub.broadcast((viewer) => (guestScope.of(viewer.id) ? null : event));
  }
}
