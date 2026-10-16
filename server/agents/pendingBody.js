// How a request parked for approval is reported, over REST and in MCP structured content alike.
export default function pendingBody(approval) {
  return { status: 'pending_approval', approval: { id: approval.id, summary: approval.summary, reasons: approval.reasons, task: approval.taskKey } };
}
