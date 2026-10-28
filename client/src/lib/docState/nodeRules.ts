const SAFE_LINK = /^(https?:\/\/|mailto:)/i;
const BLOB = /^[A-Za-z0-9_-]{1,64}$/;

type Check = (v: unknown) => boolean;
const str = (max: number): Check => (v) => v == null || (typeof v === 'string' && v.length <= max);
const int = (min: number, max: number): Check => (v) => v == null || (Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max);
const oneOf = (...ok: unknown[]): Check => (v) => v == null || ok.includes(v);
const bool: Check = (v) => v == null || typeof v === 'boolean';
const widths: Check = (v) => v == null || (Array.isArray(v) && v.length <= 50 && v.every((w) => w == null || (typeof w === 'number' && Number.isFinite(w) && w >= 0 && w <= 10_000)));
const align = oneOf('left', 'center', 'right', 'justify');
// a table cell may span a few rows or columns; a huge span makes every table change crawl
const span = int(1, 50);

// Every node and mark a doc may hold, with what each attribute may be. A teammate's browser
// wrote the doc, so anything outside this is refused before the editor sees it.
const nodes: Record<string, Record<string, Check>> = {
  paragraph: { textAlign: align },
  heading: { textAlign: align, level: int(1, 6) },
  mention: { id: str(64), label: str(200), mentionSuggestionChar: str(4) },
  blockquote: {},
  bulletList: {},
  orderedList: { start: int(0, 1_000_000), type: str(16) },
  listItem: {},
  taskList: {},
  taskItem: { checked: bool },
  codeBlock: { language: str(64) },
  hardBreak: {},
  horizontalRule: {},
  table: {},
  tableRow: {},
  tableCell: { colspan: span, rowspan: span, colwidth: widths, align },
  tableHeader: { colspan: span, rowspan: span, colwidth: widths, align },
  sealedImage: { blob: (v) => v == null || (typeof v === 'string' && BLOB.test(v)), key: str(128), mime: str(128), name: str(255), width: int(0, 100_000), height: int(0, 100_000), alt: str(2000) },
  sealedFile: { blob: (v) => v == null || (typeof v === 'string' && BLOB.test(v)), key: str(128), mime: str(128), name: str(255), size: int(0, Number.MAX_SAFE_INTEGER) },
};

const marks: Record<string, Record<string, Check>> = {
  link: { href: (v) => typeof v === 'string' && v.length <= 2048 && SAFE_LINK.test(v), target: str(16), rel: str(64), class: str(64), title: str(300) },
  bold: {},
  code: {},
  italic: {},
  strike: {},
  underline: {},
  highlight: { color: str(32) },
  comment: { thread: str(32) },
};

function fits(rules: Record<string, Check> | undefined, attrs: unknown) {
  if (!rules) return false;
  if (attrs == null || attrs === true) return true;
  if (typeof attrs !== 'object' || Array.isArray(attrs)) return false;
  return Object.entries(attrs).every(([k, v]) => Object.hasOwn(rules, k) && rules[k](v));
}

const nodeRules = {
  node: (name: string, attrs: unknown) => Object.hasOwn(nodes, name) && fits(nodes[name], attrs),
  // marks that may overlap are stored under their name and a suffix (name--hash)
  mark: (key: string, attrs: unknown) => {
    const name = key.split('--')[0];
    return Object.hasOwn(marks, name) && fits(marks[name], attrs);
  },
};

export default nodeRules;
