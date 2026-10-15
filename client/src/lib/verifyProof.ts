import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import fromBase64Url from './fromBase64Url';
import keyFingerprint from './keyFingerprint';
import type ProofCheck from '../types/ProofCheck';

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
      valid = body?.type === 'nonos.receipt' && body.workspace?.key === key && ed25519.verify(fromBase64Url(r.sig), utf8ToBytes(r.body), publicKey);
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
      completedAt: body?.completedAt ?? '',
      valid,
      title: r.reveal && revealValid ? String(r.reveal.title) : null,
      revealValid,
    };
  });

  if (contributors.size > 1) problems.push('This file mixes receipts from different people.');
  if (!items.length) problems.push('This file contains no receipts.');

  return {
    ok: problems.length === 0,
    workspace: { name: String(bundle.workspace.name ?? 'Unknown workspace'), key, fingerprint: keyFingerprint(key) },
    contributorId: contributors.size === 1 ? [...contributors][0] : null,
    wallet: wallets.size === 1 ? [...wallets][0] : null,
    declaredName: typeof bundle.contributor?.name === 'string' ? bundle.contributor.name.slice(0, 80) : null,
    items: items.sort((a: { seq: number }, b: { seq: number }) => a.seq - b.seq),
    problems,
  };
}
