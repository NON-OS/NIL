export default interface ProofCheck {
  ok: boolean;
  workspace: { name: string; key: string; fingerprint: string };
  contributorId: string | null;
  wallet: string | null;
  declaredName: string | null;
  items: { ref: string; seq: number; completedAt: string; valid: boolean; title: string | null; revealValid: boolean | null }[];
  problems: string[];
}
