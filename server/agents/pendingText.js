// What an agent is told when its request was parked for a person to approve.
export default function pendingText(approval) {
  return `Not done yet: a person has to approve this first because it ${approval.reasons.join(' and ')}. Approval ${approval.id} is waiting${approval.taskKey ? ` on ${approval.taskKey}` : ''}. Don't retry it; check later with get_approval, or carry on with other work.`;
}
