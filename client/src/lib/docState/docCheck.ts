import * as Y from 'yjs';
import treeCheck from './treeCheck';
import commentsCheck from './commentsCheck';

// a title longer than this is no title, and would make every save too big
const MAX_TITLE = 1000;
const ROOTS = new Set(['title', 'body', 'comments']);

const rootsFit = (ydoc: Y.Doc) => [...ydoc.share.keys()].every((k) => ROOTS.has(k));

type AnyType = Y.AbstractType<any>;

// Where a piece of the doc sits: how many levels under its top, and which top that is.
function placeOf(type: AnyType): [number, AnyType] {
  let depth = 0;
  let at = type;
  while (at._item) {
    at = at._item.parent as AnyType;
    depth++;
  }
  return [depth, at];
}

// Whether a doc's shared state is one Nil's editor can show safely: only the title, the body
// and the comments, a title of sensible length, a body within the schema and nesting limit, and
// comments in the shape Nil writes them.
const docCheck = {
  whole(ydoc: Y.Doc) {
    if (!rootsFit(ydoc)) return false;
    // a piece that arrived untyped takes its real type here
    for (const name of ydoc.share.keys()) (name === 'title' ? ydoc.getText(name) : name === 'body' ? ydoc.getXmlFragment(name) : ydoc.getMap(name));
    if (ydoc.share.has('title') && ydoc.getText('title').length > MAX_TITLE) return false;
    if (ydoc.share.has('comments') && !commentsCheck(ydoc.getMap('comments'))) return false;
    return !ydoc.share.has('body') || treeCheck(ydoc.getXmlFragment('body'), 0);
  },

  // The same for what one transaction changed: the pieces it touched and what it added under them.
  change(tr: Y.Transaction, ydoc: Y.Doc) {
    if (!rootsFit(ydoc)) return false;
    const isNew = (child: unknown) => {
      const item = (child as AnyType)._item;
      return Boolean(item) && item!.id.clock >= (tr.beforeState.get(item!.id.client) ?? 0);
    };
    for (const type of tr.changed.keys()) {
      const [depth, top] = placeOf(type);
      if (top === ydoc.share.get('body')) {
        if (!(type instanceof Y.XmlFragment || type instanceof Y.XmlText) || !treeCheck(type, depth, isNew)) return false;
      } else if (top === ydoc.share.get('title')) {
        if (ydoc.getText('title').length > MAX_TITLE) return false;
      } else if (top === ydoc.share.get('comments')) {
        if (!commentsCheck(ydoc.getMap('comments'))) return false;
      } else return false;
    }
    return true;
  },
};

export default docCheck;
