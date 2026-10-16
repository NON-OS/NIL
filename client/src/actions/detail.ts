import http from '../api/http';
import ApiError from '../api/ApiError';
import store from '../state/store';
import fillWords from '../state/fillWords';
import toast from '../state/toast';
import router from '../lib/router';
import socket from '../realtime/socket';
import type Comment from '../types/Comment';
import type Attachment from '../types/Attachment';
import type Activity from '../types/Activity';
import type Task from '../types/Task';
import taskKeys from './taskKeys';
import commentText from './commentText';

// Comments on a private task are opened here as they arrive, and sealed before they leave.
const opened = (taskId: string, list: Comment[]) => {
  const task = store.get().tasks[taskId];
  return task?.sealed ? Promise.all(list.map((c) => commentText.open(task, c))) : Promise.resolve(list);
};

async function outgoing(taskId: string, body: string) {
  const task = store.get().tasks[taskId];
  if (!task?.sealed) return { body };
  return { body: await commentText.seal(await taskKeys.open(task.sealed), store.get().me!.id, body), sealed: true };
}

interface DetailResponse {
  task: Task;
  comments: Comment[];
  activity: Activity[];
  attachments: Attachment[];
  watchers: string[];
}

function patchDetail(taskId: string, fn: (d: NonNullable<ReturnType<typeof store.get>['detail']>) => Partial<Omit<DetailResponse, 'task'>>) {
  store.set((s) => (s.detail?.taskId === taskId ? { detail: { ...s.detail, ...fn(s.detail) } } : {}));
}

const detail = {
  open: (task: { number: number }) => router.setParam('task', String(task.number)),
  close: () => router.setParam('task', null),

  async load(taskId: string) {
    store.set({ detail: { taskId, loading: true, comments: [], activity: [], attachments: [], watchers: [] } });
    socket.viewing(taskId);
    try {
      const { task, ...d } = await http.get<DetailResponse>(`/tasks/${taskId}/detail`);
      // the board only holds the card; the panel needs the notes and checklist too
      fillWords(task);
      const comments = await opened(taskId, d.comments);
      if (store.get().detail?.taskId === taskId) store.set({ detail: { taskId, loading: false, ...d, comments } });
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) toast.error(err);
    }
  },

  clear() {
    store.set({ detail: null });
    socket.viewing(null);
  },

  async comment(taskId: string, body: string) {
    try {
      const sent = await http.post<{ comment: Comment }>(`/tasks/${taskId}/comments`, await outgoing(taskId, body));
      const comment = { ...sent.comment, body, locked: false };
      patchDetail(taskId, (d) => ({ comments: d.comments.some((c) => c.id === comment.id) ? d.comments : [...d.comments, comment] }));
      return true;
    } catch (err) {
      toast.error(err);
      return false;
    }
  },

  async editComment(comment: Comment, body: string) {
    try {
      const res = await http.patch<{ comment: Comment }>(`/comments/${comment.id}`, { body: (await outgoing(comment.taskId, body)).body });
      const edited = { ...res.comment, body, locked: false };
      patchDetail(comment.taskId, (d) => ({ comments: d.comments.map((c) => (c.id === comment.id ? edited : c)) }));
    } catch (err) {
      toast.error(err);
    }
  },

  async deleteComment(comment: Comment) {
    try {
      await http.del(`/comments/${comment.id}`);
      patchDetail(comment.taskId, (d) => ({ comments: d.comments.filter((c) => c.id !== comment.id) }));
    } catch (err) {
      toast.error(err);
    }
  },

  async upload(taskId: string, file: File) {
    try {
      const { attachment } = await http.upload<{ attachment: Attachment }>(`/tasks/${taskId}/attachments`, file);
      patchDetail(taskId, (d) => ({ attachments: d.attachments.some((a) => a.id === attachment.id) ? d.attachments : [...d.attachments, attachment] }));
    } catch (err) {
      toast.error(err);
    }
  },

  async deleteAttachment(attachment: Attachment) {
    try {
      await http.del(`/attachments/${attachment.id}`);
      patchDetail(attachment.taskId, (d) => ({ attachments: d.attachments.filter((a) => a.id !== attachment.id) }));
    } catch (err) {
      toast.error(err);
    }
  },

  async watch(taskId: string, on: boolean) {
    try {
      const { watchers } = on ? await http.put<{ watchers: string[] }>(`/tasks/${taskId}/watch`) : await http.del<{ watchers: string[] }>(`/tasks/${taskId}/watch`);
      patchDetail(taskId, () => ({ watchers }));
    } catch (err) {
      toast.error(err);
    }
  },
};

export default detail;
