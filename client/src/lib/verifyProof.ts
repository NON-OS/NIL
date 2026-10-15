import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import fromBase64Url from './fromBase64Url';
import keyFingerprint from './keyFingerprint';
import type ProofCheck from '../types/ProofCheck';
import type ProofPayment from '../types/ProofPayment';

const TYPES = new Set(['nonos.receipt', 'nonos.payment']);

// A payment receipt names the transaction, so anyone can confirm the transfer on-chain too.
function payment(body: any): ProofPayment | null {
  const p = body?.payment;
  if (body?.type !== 'nonos.payment') return null;
  if (!p || !/^\d{1,40}$/.test(p.amount) || !/^0x[0-9a-f]{64}$/.test(p.tx) || !Number.isInteger(p.decimals) || !Number.isInteger(p.chainId)) return null;
  return { amount: p.amount, symbol: String(p.symbol ?? 'tokens').slice(0, 12), decimals: p.decimals, chainId: p.chainId, tx: p.tx };
}

// Checks a proof file entirely in the browser. Nothing is uploaded anywhere.
export default function verifyProof(text: string): ProofCheck {
  let bundle: any;
  try {
    bundle = JSON.parse(text);
  } catch {
    throw new Error('That file isn’t valid JSON.');
  }
  if (bundle?.type !== 'nonos.proof' || !Array.isArray(bundle.receipts) || typeof bundle.workspace?.key !== 'string') {
    throw new Error('That isn’t a NONOS proof file.');
  }

  const key = bundle.workspace.key as string;
  let publicKey: Uint8Array;
  try {
    publicKey = fromBase64Url(key);
    if (publicKey.length !== 32) throw new Error();
  } catch {
    throw new Error('The workspace key in this file is malformed.');
  }

  const problems: string[] = [];
  const contributors = new Set<string>();
  const wallets = new Set<string>();
  const items = bundle.receipts.map((r: any, i: number) => {
    let body: any = null;
    let valid = false;
    try {
      body = JSON.parse(r.body);
      valid = TYPES.has(body?.type) && (body.type !== 'nonos.payment' || payment(body) !== null) && body.workspace?.key === key && ed25519.verify(fromBase64Url(r.sig), utf8ToBytes(r.body), publicKey);
    } catch {
      valid = false;
    }
    if (!valid) problems.push(`Receipt ${i + 1} has an invalid signature or was edited.`);
    if (body?.contributor?.id) contributors.add(body.contributor.id);
    if (body?.contributor?.wallet) wallets.add(body.contributor.wallet);

    let revealValid: boolean | null = null;
    if (r.reveal && body) {
      revealValid = bytesToHex(sha256(utf8ToBytes(`${r.reveal.salt}:${r.reveal.title}`))) === body.task?.commit;
      if (!revealValid) problems.push(`The revealed title for ${body.task?.ref ?? `receipt ${i + 1}`} doesn’t match what was signed.`);
    }
    return {
      ref: body?.task?.ref ?? '?',
      seq: body?.seq ?? 0,
      completedAt: body?.completedAt ?? body?.paidAt ?? '',
      valid,
      title: r.reveal && revealValid ? String(r.reveal.title) : null,
      revealValid,
      paid: valid ? payment(body) : null,
    };
  });

  const totals = new Map<string, { symbol: string; decimals: number; amount: bigint }>();
  for (const item of items as ProofCheck['items']) {
    if (!item.paid) continue;
    const key = `${item.paid.chainId}:${item.paid.symbol}:${item.paid.decimals}`;
    const t = totals.get(key) ?? { symbol: item.paid.symbol, decimals: item.paid.decimals, amount: 0n };
    t.amount += BigInt(item.paid.amount);
    totals.set(key, t);
  }

  if (contributors.size > 1) problems.push('This file mixes receipts from different people.');
  if (!items.length) problems.push('This file contains no receipts.');

  return {
    ok: problems.length === 0,
    workspace: { name: String(bundle.workspace.name ?? 'Unknown workspace'), key, fingerprint: keyFingerprint(key) },
    contributorId: contributors.size === 1 ? [...contributors][0] : null,
    wallet: wallets.size === 1 ? [...wallets][0] : null,
    declaredName: typeof bundle.contributor?.name === 'string' ? bundle.contributor.name.slice(0, 80) : null,
    paidTotals: [...totals.values()].map((t) => ({ ...t, amount: t.amount.toString() })),
    items: items.sort((a: { seq: number }, b: { seq: number }) => a.seq - b.seq),
    problems,
  };
}
