type Handler = (event: { type: string; docId: string; [k: string]: unknown }) => void;

const handlers = new Map<string, Handler>();

// The docs open for live editing in this tab, by id, so socket events reach their editor. It
// holds no editor code, so the app can route events without loading the editor.
const liveDocs = {
  register(docId: string, handler: Handler) {
    handlers.set(docId, handler);
    return () => {
      if (handlers.get(docId) === handler) handlers.delete(docId);
    };
  },
  dispatch(event: { type: string; docId?: unknown }) {
    if (typeof event.docId === 'string') handlers.get(event.docId)?.(event as Parameters<Handler>[0]);
  },
};

export default liveDocs;
