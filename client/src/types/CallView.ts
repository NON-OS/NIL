// A call as the server describes it: who started it, who is in it and who is being rung. What
// anyone says or shows never passes through the server.
export default interface CallView {
  id: string;
  kind: 'person' | 'project';
  projectId: string | null;
  startedBy: string;
  startedAt: number;
  members: { userId: string; session: string; joinedAt: number }[];
  ringing: string[];
}
