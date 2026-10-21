import store from '../state/store';
import records from '../state/records';
import putTask from '../state/putTask';
import commentVersions from '../state/commentVersions';
import type TaskDetail from '../types/TaskDetail';
import type Comment from '../types/Comment';
import type Attachment from '../types/Attachment';
import commentText from '../actions/commentText';
import fileSeal from '../actions/fileSeal';
import checkBuild from '../actions/checkBuild';
import recountArchive from '../actions/recountArchive';
import isArchived from '../lib/isArchived';
import agentActivity from '../actions/agentActivity';

// a comment on a private task arrives encrypted and is opened before it's shown
const openComment = (comment: Comment) => {
  const task = store.get().tasks[comment.taskId];
  return task ? commentText.open(task, comment) : Promise.resolve(comment);
};

// so does a file's name and type; a file that moved to a new key arrives again and replaces the old copy
const openFile = (file: Attachment) => {
  const task = store.get().tasks[file.taskId];
  return task ? fileSeal.open(task, file) : Promise.resolve(file);
};

// Changes the open task panel only if it's showing the task the event is about.
function patchDetail(taskId: string, fn: (d: TaskDetail) => Partial<TaskDetail>) {
  const d = store.get().detail;
  if (d && d.taskId === taskId) store.set({ detail: { ...d, ...fn(d) } });
}

// Applies one server push to the local store. Unknown event types are ignored
// so an older tab keeps working after a server upgrade.
export default function applyEvent(event: any): void {
  const s = store.get();
  switch (event.type) {
    case 'hello':
      checkBuild(event.build);
      store.set({ presence: event.presence });
      break;
    case 'presence':
      store.set({ presence: event.presence });
      break;
    case 'task':
      putTask(event.task);
      break;
    // the task went private (or was reassigned away) and we're no longer allowed to see it
    case 'task.gone': {
      // an archived task, or one this tab never loaded, may be in the archive's counts
      const held = s.tasks[event.id];
      if (!held || isArchived(held, s.archive.before)) recountArchive();
      store.set({ tasks: records.drop(s.tasks, event.id) });
      break;
    }
    case 'project':
      store.set({ projects: records.put(s.projects, event.project) });
      break;
    case 'project.delete':
      store.set({ projects: records.drop(s.projects, event.id) });
      break;
    case 'label':
      store.set({ labels: records.put(s.labels, event.label) });
      break;
    case 'label.delete':
      store.set({ labels: records.drop(s.labels, event.id) });
      break;
    case 'goal':
      store.set({ goals: records.put(s.goals, event.goal) });
      break;
    case 'goal.delete':
      store.set({ goals: records.drop(s.goals, event.id) });
      break;
    case 'user': {
      // broadcasts may hide our own address from the payload, so keep the one we already have
      const me = s.me && s.me.id === event.user.id ? { ...s.me, ...event.user, address: event.user.address ?? s.me.address } : s.me;
      store.set({ users: records.put(s.users, event.user), me });
      break;
    }
    case 'user.delete':
      store.set({ users: records.drop(s.users, event.id) });
      break;
    case 'workspace':
      store.set({ workspace: event.workspace });
      break;
    case 'proposals':
      store.set({ proposalsRev: s.proposalsRev + 1 });
      break;
    case 'plan':
      store.set({ plan: event.plan });
      break;
    case 'ai-credits':
      store.set({ aiAnonymous: s.ai && Boolean(event.on) });
      break;
    case 'ai-provider':
      store.set({ ai: Boolean(event.ai), aiProvider: event.provider ?? null, aiAnonymous: Boolean(event.anonymous) });
      break;
    case 'verification':
      if (s.nox) store.set({ nox: { ...s.nox, verification: event.verification } });
      break;
    case 'docs':
      store.set({ docsRev: s.docsRev + 1 });
      break;
    // someone published or re-signed encryption keys: the directory is fetched and checked again
    case 'keys':
      store.set({ keysRev: s.keysRev + 1 });
      break;
    case 'timer':
      store.set({ timer: event.timer });
      break;
    case 'notification':
      store.set({ unread: s.unread + 1, inbox: s.inbox ? [event.notification, ...s.inbox] : null });
      window.dispatchEvent(new CustomEvent('nonos:notification', { detail: event.notification }));
      break;
    case 'unread':
      store.set({ unread: event.unread });
      break;
    case 'activity':
      if (s.feed) store.set({ feed: [event.activity, ...s.feed].slice(0, 200) });
      patchDetail(event.activity.taskId, (d) => ({ activity: [...d.activity, event.activity] }));
      break;
    case 'comment':
      void openComment(event.comment).then((comment) =>
        patchDetail(comment.taskId, (d) => ({
          comments: d.comments.some((c) => c.id === comment.id) ? d.comments.map((c) => (c.id === comment.id ? comment : c)) : [...d.comments, comment],
        })),
      );
      break;
    case 'comment.delete':
      // so a server that later brings an encrypted comment back is caught
      if (s.tasks[event.taskId]?.sealed) commentVersions.drop(event.id);
      patchDetail(event.taskId, (d) => ({ comments: d.comments.filter((c) => c.id !== event.id) }));
      break;
    case 'attachment':
      void openFile(event.attachment).then((file) =>
        patchDetail(file.taskId, (d) => ({
          attachments: d.attachments.some((a) => a.id === file.id) ? d.attachments.map((a) => (a.id === file.id ? file : a)) : [...d.attachments, file],
        })),
      );
      break;
    case 'attachment.delete':
      patchDetail(event.taskId, (d) => ({ attachments: d.attachments.filter((a) => a.id !== event.id) }));
      break;
    case 'watchers':
      patchDetail(event.taskId, () => ({ watchers: event.watchers }));
      break;
    // an agent's run moved on, or one of its approval cards changed, on the task that's open
    case 'agent.run':
      agentActivity.putRun(event.run);
      break;
    case 'agent.approval':
      agentActivity.putApproval(event.approval);
      break;
    case 'wiped':
      // the workspace was erased; reload into the fresh-install screen
      location.replace('/');
      break;
    case 'typing': {
      const forTask = { ...(s.typing[event.taskId] ?? {}), [event.userId]: Date.now() + 4000 };
      store.set({ typing: { ...s.typing, [event.taskId]: forTask } });
      break;
    }
  }
}
