import * as Y from 'yjs';
import docCheck from './docCheck';

const copy = (source: Y.Doc) => {
  const shadow = new Y.Doc();
  // the three pieces a doc has, declared so they take their real types as changes arrive
  shadow.getText('title');
  shadow.getXmlFragment('body');
  shadow.getMap('comments');
  Y.applyUpdate(shadow, Y.encodeStateAsUpdate(source));
  return shadow;
};

// Tries each teammate's change on a copy of the doc before it touches the real one, and checks
// what it changed (see docCheck). A change that fails, or throws, never reaches the editor, so a
// crafted one can't freeze it, crash it or leave it showing something other than the doc. The
// copy follows every change the doc takes, and starts again from the doc after a refusal.
export default function createStateGuard(source: Y.Doc) {
  let shadow = copy(source);
  const follow = (update: Uint8Array) => {
    try {
      Y.applyUpdate(shadow, update);
    } catch {
      shadow = copy(source);
    }
  };
  source.on('update', follow);

  return {
    accepts(update: Uint8Array) {
      let ok = true;
      const watch = (tr: Y.Transaction) => {
        if (ok && !docCheck.change(tr, shadow)) ok = false;
      };
      shadow.on('afterTransaction', watch);
      try {
        Y.applyUpdate(shadow, update);
      } catch {
        ok = false;
      } finally {
        shadow.off('afterTransaction', watch);
      }
      if (!ok) shadow = copy(source);
      return ok;
    },
    stop() {
      source.off('update', follow);
      shadow.destroy();
    },
  };
}
