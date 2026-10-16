import http from '../api/http';
import ApiError from '../api/ApiError';
import store from '../state/store';
import toast from '../state/toast';
import type AgentRun from '../types/AgentRun';
import type AgentApproval from '../types/AgentApproval';

const upsert = <T extends { id: string }>(list: T[], item: T) => (list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item]);

// Agent runs and approval cards for the task open in the panel, kept live by socket events.
const agentActivity = {
  async load(taskId: string) {
    store.set({ agentActivity: { taskId, runs: [], approvals: [] } });
    try {
      const res = await http.get<{ runs: AgentRun[]; approvals: AgentApproval[] }>(`/tasks/${taskId}/agent-activity`);
      if (store.get().agentActivity?.taskId === taskId) store.set({ agentActivity: { taskId, ...res } });
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) toast.error(err);
    }
  },

  clear(taskId: string) {
    if (store.get().agentActivity?.taskId === taskId) store.set({ agentActivity: null });
  },

  putRun(run: AgentRun) {
    const current = store.get().agentActivity;
    if (current && current.taskId === run.taskId) store.set({ agentActivity: { ...current, runs: upsert(current.runs, run) } });
  },

  putApproval(approval: AgentApproval) {
    const current = store.get().agentActivity;
    if (current && current.taskId === approval.taskId) store.set({ agentActivity: { ...current, approvals: upsert(current.approvals, approval) } });
  },

  async decide(approval: AgentApproval, approve: boolean) {
    try {
      const res = await http.post<{ approval: AgentApproval }>(`/agent-approvals/${approval.id}/${approve ? 'approve' : 'decline'}`);
      agentActivity.putApproval(res.approval);
      if (res.approval.status === 'failed') toast.show(`Approved, but it couldn’t be done: ${String(res.approval.result?.error ?? 'unknown error')}`, { tone: 'error' });
      return res.approval;
    } catch (err) {
      toast.error(err);
      return null;
    }
  },
};

export default agentActivity;
