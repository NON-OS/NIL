// One line of a run log: what the agent was told, a model turn, a tool call and its outcome,
// a refusal, an approval it asked for, or a note from the runner.
export default interface AgentStep {
  seq: number;
  kind: 'brief' | 'model' | 'tool' | 'refused' | 'approval' | 'guard' | 'note' | 'error';
  tool: string | null;
  input: unknown;
  output: string | null;
  ok: boolean;
  createdAt: number;
}
