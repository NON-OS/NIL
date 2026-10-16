// Turns what someone typed into a safe FTS5 query: every word must appear, each as a prefix,
// so "offs ven" finds "Book a venue for the offsite". Only letters and digits survive, which
// leaves nothing that FTS5 could read as syntax (quotes, NEAR, column filters, AND/OR).
export default function ftsQuery(input, { maxTerms = 8, maxTermLength = 40 } = {}) {
  const words = String(input ?? '').normalize('NFKC').match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
  return words
    .slice(0, maxTerms)
    .map((word) => `"${word.slice(0, maxTermLength)}"*`)
    .join(' ');
}
