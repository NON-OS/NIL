import * as Y from 'yjs';
import nodeRules from './nodeRules';

// how deep blocks may nest: lists in lists, quotes and tables go nowhere near it
const MAX_DEPTH = 100;

type Piece = Y.XmlFragment | Y.XmlElement | Y.XmlText;

function textFits(text: Y.XmlText) {
  for (const op of text.toDelta() as { insert: unknown; attributes?: Record<string, unknown> }[]) {
    if (typeof op.insert !== 'string') return false;
    for (const [key, value] of Object.entries(op.attributes ?? {})) if (!nodeRules.mark(key, value)) return false;
  }
  return true;
}

function fits(node: unknown, root: boolean) {
  if (node instanceof Y.XmlText) return textFits(node);
  if (node instanceof Y.XmlElement) return nodeRules.node(node.nodeName, node.getAttributes());
  return root && node instanceof Y.XmlFragment;
}

const children = (node: unknown) => (node instanceof Y.XmlText ? [] : (node as Y.XmlFragment).toArray());

// Checks a piece of a doc's body, and everything under it, against the editor's schema without
// recursion, so a node nested thousands deep is refused instead of overflowing the stack.
// `depth` is how deep the piece sits. With `fresh`, only the piece's children it picks (the ones
// a change just added) are looked into; anything under those always is.
export default function treeCheck(start: Piece, depth: number, fresh?: (child: unknown) => boolean) {
  if (depth > MAX_DEPTH || !fits(start, true)) return false;
  const stack: [unknown, number][] = children(start)
    .filter((c) => !fresh || fresh(c))
    .map((c) => [c, depth + 1]);
  while (stack.length) {
    const [node, at] = stack.pop()!;
    if (at > MAX_DEPTH || !fits(node, false)) return false;
    for (const c of children(node)) stack.push([c, at + 1]);
  }
  return true;
}
