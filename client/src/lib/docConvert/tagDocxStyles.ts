// Runs through mammoth's reading of a Word file before it becomes HTML, and names what a style
// map can't see on its own: a heading or plain paragraph that is centred, right aligned or
// justified gets the alignment added to its style name, and text set in a monospace font with no
// style of its own is named as code, as Google Docs and most hand-made documents do it.

interface Element {
  type: string;
  children?: Element[];
  styleId?: string | null;
  styleName?: string | null;
  alignment?: string | null;
  numbering?: unknown;
  font?: string | null;
  value?: string;
}

const ALIGN: Record<string, string> = { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' };
const HEADING = /^(title|heading [1-6])$/i;
const MONO = /^(consolas|courier( new)?|menlo|monaco|lucida console|andale mono|sf mono|roboto mono|source code pro|jetbrains mono|fira (code|mono)|ibm plex mono|cascadia (code|mono)|dejavu sans mono|liberation mono|ubuntu mono|noto sans mono)$/i;

const capitalised = (name: string) => name[0].toUpperCase() + name.slice(1).toLowerCase();
const isMono = (el: Element) => MONO.test(el.font ?? '');
const textRuns = (el: Element): Element[] => (el.type === 'run' ? (el.children?.some((c) => c.type === 'text' && c.value?.trim()) ? [el] : []) : (el.children ?? []).flatMap(textRuns));

function paragraph(p: Element): Element {
  const align = ALIGN[p.alignment ?? ''];
  if (HEADING.test(p.styleName ?? '')) return { ...p, styleName: [capitalised(p.styleName!), align].filter(Boolean).join(' ') };
  // a style the file names but doesn't define is left to the style map
  const plain = p.styleName ? /^normal$/i.test(p.styleName) : !p.styleId;
  if (!plain || p.numbering) return p;
  const runs = textRuns(p);
  if (runs.length && runs.every(isMono)) return { ...p, styleName: 'Code' };
  return align ? { ...p, styleName: `Normal ${align}` } : p;
}

export default function tagDocxStyles(element: Element): Element {
  const children = element.children?.map(tagDocxStyles);
  const el = children ? { ...element, children } : element;
  if (el.type === 'paragraph') return paragraph(el);
  if (el.type === 'run' && !el.styleName && isMono(el)) return { ...el, styleName: 'Inline Code' };
  return el;
}
