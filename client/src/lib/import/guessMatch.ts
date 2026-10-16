import foldText from '../foldText';

// The likely counterpart of a name from another app: the same name, ignoring case and
// accents, or failing that the only option with the same first word ("Ana" for "Ana Lopez").
export default function guessMatch(name: string, options: { id: string; name: string }[]): string | null {
  const wanted = foldText(name).trim();
  const exact = options.find((o) => foldText(o.name).trim() === wanted);
  if (exact) return exact.id;
  const first = wanted.split(/\s+/)[0];
  const byFirst = options.filter((o) => foldText(o.name).trim().split(/\s+/)[0] === first);
  return first && byFirst.length === 1 ? byFirst[0].id : null;
}
