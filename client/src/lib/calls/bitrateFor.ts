// How much video one browser sends each other person, in bits a second. In a mesh everyone
// uploads a copy to everyone else, so the more people, the less each copy gets. A shared
// screen gets more, since text needs it.
export default function bitrateFor(others: number, kind: 'camera' | 'screen') {
  const n = Math.max(1, others);
  if (kind === 'screen') return n <= 1 ? 2_500_000 : Math.max(600_000, Math.round(3_000_000 / n));
  if (n <= 1) return 1_500_000;
  if (n === 2) return 900_000;
  return Math.max(250_000, Math.round(2_000_000 / n));
}
