import type TaskDetail from '../types/TaskDetail';

// The open task panel with everything this tab decrypted for it forgotten: encrypted comments and
// files show as locked again, the way they arrive before a key opens them.
export default function lockedDetail(d: TaskDetail): TaskDetail {
  return {
    ...d,
    comments: d.comments.map((c) => (c.sealed ? { ...c, body: '', locked: true } : c)),
    attachments: d.attachments.map((a) => (a.sealed ? { ...a, filename: '', mime: '', locked: true } : a)),
  };
}
