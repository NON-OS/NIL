import foldText from './foldText';

// The words of a search, folded and without duplicates. Punctuation only separates words.
export default function searchWords(query: string) {
  return [...new Set(foldText(query).match(/[\p{L}\p{N}]+/gu) ?? [])];
}
