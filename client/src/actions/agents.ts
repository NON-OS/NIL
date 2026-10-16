import http from '../api/http';
import type Agent from '../types/Agent';
import type AgentInput from '../types/AgentInput';
import type AgentOptions from '../types/AgentOptions';
import type AgentRun from '../types/AgentRun';
import type AgentApproval from '../types/AgentApproval';
import type AgentAuditEntry from '../types/AgentAuditEntry';
import type WebhookDelivery from '../types/WebhookDelivery';

interface AgentSettings {
  enabled: boolean;
  changedAt: number | null;
  changedBy: string | null;
}

// Settings → Agents. Keys and webhook secrets come back once, from create, rotate and the first
// webhook save, and are never stored in the browser.
const agents = {
  list: () => http.get<{ agents: Agent[]; settings: AgentSettings; options?: AgentOptions }>('/agents'),
  create: (input: Partial<AgentInput>) => http.post<{ agent: Agent; key: string | null }>('/agents', input),
  update: (id: string, input: Partial<AgentInput>) => http.patch<{ agent: Agent }>(`/agents/${id}`, input),
  pause: (id: string) => http.post<{ agent: Agent }>(`/agents/${id}/pause`),
  resume: (id: string) => http.post<{ agent: Agent }>(`/agents/${id}/resume`),
  rotateKey: (id: string) => http.post<{ key: string; agent: Agent }>(`/agents/${id}/key`),
  remove: (id: string) => http.del<{ ok: true }>(`/agents/${id}`),
  setEnabled: (enabled: boolean) => http.put<{ settings: AgentSettings }>('/agent-settings', { enabled }),

  saveWebhook: (id: string, input: { url: string; events: string[] }) => http.put<{ secret: string | null; agent: Agent }>(`/agents/${id}/webhook`, input),
  rotateWebhookSecret: (id: string) => http.post<{ secret: string }>(`/agents/${id}/webhook/secret`),
  enableWebhook: (id: string) => http.post<{ agent: Agent }>(`/agents/${id}/webhook/enable`),
  removeWebhook: (id: string) => http.del<{ agent: Agent }>(`/agents/${id}/webhook`),
  testWebhook: (id: string) => http.post<{ delivery: WebhookDelivery }>(`/agents/${id}/webhook/test`),
  deliveries: (id: string) => http.get<{ deliveries: WebhookDelivery[] }>(`/agents/${id}/webhook/deliveries`),
  redeliver: (deliveryId: string) => http.post<{ delivery: WebhookDelivery }>(`/webhook-deliveries/${deliveryId}/redeliver`),

  runs: (id: string) => http.get<{ runs: AgentRun[] }>(`/agents/${id}/runs`),
  cancelRun: (runId: string) => http.post<{ ok: true }>(`/agent-runs/${runId}/cancel`),
  audit: (id: string) => http.get<{ entries: AgentAuditEntry[] }>(`/agents/${id}/audit`),
  approvals: () => http.get<{ approvals: AgentApproval[] }>('/agent-approvals'),
};

export default agents;
