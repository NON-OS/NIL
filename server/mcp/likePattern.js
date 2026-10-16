// A LIKE pattern that matches the text anywhere, with % and _ taken literally (ESCAPE '\').
export default function likePattern(text) {
  return `%${String(text).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
