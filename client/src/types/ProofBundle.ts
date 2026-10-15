export default interface ProofBundle {
  type: 'nonos.proof';
  v: 1;
  exportedAt: string;
  workspace: { name: string; key: string };
  // self-declared and unsigned; the verifier labels it as such
  contributor: { name?: string };
  receipts: { body: string; sig: string; reveal: { title: string; salt: string } | null }[];
}
