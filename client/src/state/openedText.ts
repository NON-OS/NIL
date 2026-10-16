import store from './store';

// Words this tab has decrypted, kept so search can find them: docs it opened (or listed, for
// titles) and the comments of private tasks it showed. Private task titles, notes and
// checklists already live in the store once opened. Memory only, never sent anywhere, and
// dropped the moment the keys go: on lock, sign-out or reload.
const docs = new Map<string, { title: string; body: string | null }>();
const comments = new Map<string, string[]>();

store.subscribe(() => {
  const s = store.get();
  if (!s.docsUnlocked) {
    docs.clear();
    comments.clear();
    return;
  }
  const d = s.detail;
  if (d && !d.loading && s.tasks[d.taskId]?.sealed) comments.set(d.taskId, d.comments.filter((c) => !c.locked).map((c) => c.body));
});

const openedText = {
  rememberDoc(doc: { id: string; title: string; body: string | null }) {
    if (!store.get().docsUnlocked) return;
    // a listing carries titles only; keep a body this tab already opened
    docs.set(doc.id, { title: doc.title, body: doc.body ?? docs.get(doc.id)?.body ?? null });
  },
  forgetDoc: (id: string) => void docs.delete(id),
  docs: () => [...docs.entries()].map(([id, d]) => ({ id, ...d })),
  comments: (taskId: string) => comments.get(taskId) ?? [],
};

export default openedText;
