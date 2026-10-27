// A call as the server describes it: who started it, who is in it and who is being rung. What
// anyone says or shows never passes through the server.
export default interface CallView {
  id: string;
  kind: 'person' | 'project';
  // browser to browser, or on the SFU once the call is too big for that
  mode: 'mesh' | 'sfu';
  projectId: string | null;
  startedBy: string;
  startedAt: number;
  members: { userId: string; session: string; joinedAt: number }[];
  ringing: string[];
}
