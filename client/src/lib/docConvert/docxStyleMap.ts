// How Word's styles become HTML the doc schema knows. Earlier lines win, so headings stay
// headings even when Word numbers them, and only then do numbered paragraphs become lists.
// Aligned paragraphs reach here with the alignment added to their style name (tagDocxStyles).
const HEADINGS: [string, string][] = [
  ['Title', "h1[data-title='1']"],
  ['Heading 1', 'h1'],
  ['Heading 2', 'h2'],
  ['Heading 3', 'h3'],
  // a doc has three heading levels, so Word's deeper ones join the third
  ['Heading 4', 'h3'],
  ['Heading 5', 'h3'],
  ['Heading 6', 'h3'],
];
const ALIGNS = ['center', 'right', 'justify'];
const CODE_BLOCKS = ['Code', 'Code Block', 'Source Code', 'HTML Preformatted', 'Plain Text'];
const CODE_RUNS = ['Inline Code', 'Code Char', 'HTML Code', 'Verbatim Char'];
const QUOTES = ['Quote', 'Intense Quote', 'Block Text'];
const LIST_LEVELS = 9;

// `p:ordered-list(3) => ul|ol > li > ul|ol > li > ol > li:fresh`, and the same for bullets
const list = (kind: 'ordered' | 'unordered', level: number) => {
  const parents = Array.from({ length: level - 1 }, () => 'ul|ol > li > ').join('');
  return `p:${kind}-list(${level}) => ${parents}${kind === 'ordered' ? 'ol' : 'ul'} > li:fresh`;
};

const docxStyleMap = [
  ...HEADINGS.map(([name, html]) => `p[style-name='${name}'] => ${html}:fresh`),
  ...[...HEADINGS, ['Normal', 'p']].flatMap(([name, html]) => ALIGNS.map((align) => `p[style-name='${name} ${align}'] => ${html}[data-align='${align}']:fresh`)),
  ...CODE_BLOCKS.map((name) => `p[style-name='${name}'] => pre:separator('\\n')`),
  ...QUOTES.map((name) => `p[style-name='${name}'] => blockquote > p:fresh`),
  "p[style-name='Horizontal Line'] => hr:fresh",
  ...Array.from({ length: LIST_LEVELS }, (_, i) => [list('unordered', i + 1), list('ordered', i + 1)]).flat(),
  ...CODE_RUNS.map((name) => `r[style-name='${name}'] => code`),
  'u => u',
  'strike => s',
  'highlight => mark',
  'table => table',
];

export default docxStyleMap;
