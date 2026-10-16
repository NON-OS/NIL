import type AgentRun from './AgentRun';
import type AgentApproval from './AgentApproval';

// Agent runs and approval cards on the task that's open in the panel.
export default interface AgentActivity {
  taskId: string;
  runs: AgentRun[];
  approvals: AgentApproval[];
}
