// Lowercase without accents, so "Café" and "cafe" compare equal, the way the server's search
// index folds words too.
export default function foldText(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
