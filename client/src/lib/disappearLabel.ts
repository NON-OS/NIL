// A disappearing-messages setting in words: "1 hour", "7 days".
export default function disappearLabel(seconds: number) {
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (seconds < 3600) return plural(Math.round(seconds / 60), 'minute');
  if (seconds < 86_400) return plural(Math.round(seconds / 3600), 'hour');
  if (seconds < 7 * 86_400 || seconds % (7 * 86_400)) return plural(Math.round(seconds / 86_400), 'day');
  return plural(seconds / (7 * 86_400), 'week');
}
