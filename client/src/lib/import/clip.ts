// Trims text to what the server accepts for a field, marking the cut.
export default function clip(text: string, max: number) {
  const clean = text.trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}
