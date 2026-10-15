// Higher is better; 0 means no match. Rewards prefix and word-start hits so "nl" finds "Newsletter launch".
export default function fuzzyScore(text: string, query: string) {
  const t = text.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return 1;
  const direct = t.indexOf(q);
  if (direct === 0) return 100;
  if (direct > 0) return 60 - Math.min(direct, 40) / 2;

  let score = 0;
  let ti = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return 0;
    score += found === 0 || /[\s\-_/]/.test(t[found - 1]) ? 4 : 1;
    ti = found + 1;
  }
  return score;
}
