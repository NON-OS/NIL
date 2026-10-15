import http from '../api/http';
import ApiError from '../api/ApiError';
import store from '../state/store';
import toast from '../state/toast';
import router from '../lib/router';
import socket from '../realtime/socket';
import type Comment from '../types/Comment';
import type Attachment from '../types/Attachment';
import type Activity from '../types/Activity';

interface DetailResponse {
  comments: Comment[];
  activity: Activity[];
  attachments: Attachment[];
  watchers: string[];
}

function patchDetail(taskId: string, fn: (d: NonNullable<ReturnType<typeof store.get>['detail']>) => Partial<DetailResponse>) {
  store.set((s) => (s.detail?.taskId === taskId ? { detail: { ...s.detail, ...fn(s.detail) } } : {}));
}

const detail = {
  open: (task: { number: number }) => router.setParam('task', String(task.number)),
  close: () => router.setParam('task', null),

  async load(taskId: string) {
    store.set({ detail: { taskId, loading: true, comments: [], activity: [], attachments: [], watchers: [] } });
    socket.viewing(taskId);
    try {
      const d = await http.get<DetailResponse>(`/tasks/${taskId}/detail`);
      if (store.get().detail?.taskId === taskId) store.set({ detail: { taskId, loading: false, ...d } });
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
      const { comment } = await http.post<{ comment: Comment }>(`/tasks/${taskId}/comments`, { body });
      patchDetail(taskId, (d) => ({ comments: d.comments.some((c) => c.id === comment.id) ? d.comments : [...d.comments, comment] }));
      return true;
    } catch (err) {
      toast.error(err);
      return false;
    }
  },

  async editComment(comment: Comment, body: string) {
    try {
      const res = await http.patch<{ comment: Comment }>(`/comments/${comment.id}`, { body });
      patchDetail(comment.taskId, (d) => ({ comments: d.comments.map((c) => (c.id === comment.id ? res.comment : c)) }));
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
