import type Receipt from '../types/Receipt';
import type ProofBundle from '../types/ProofBundle';

interface Options {
  workspace: { name: string; key: string };
  receipts: Receipt[];
  reveal: Set<string>;
  name?: string;
}

// Only the receipts you picked go in, and only the titles you chose to reveal.
export default function buildProof({ workspace, receipts, reveal, name }: Options): ProofBundle {
  return {
    type: 'nonos.proof',
    v: 1,
    exportedAt: new Date().toISOString(),
    workspace,
    contributor: name ? { name } : {},
    receipts: receipts.map((r) => ({
      body: r.body,
      sig: r.signature,
      reveal: reveal.has(r.id) && r.title !== null && r.salt !== null ? { title: r.title, salt: r.salt } : null,
    })),
  };
}
