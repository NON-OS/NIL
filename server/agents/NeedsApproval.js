// Thrown by a tool, before it changes anything, when an agent asks for something a person has to
// sign off first. The tool layer turns it into an approval card instead of an error.
export default class NeedsApproval extends Error {
  constructor(reasons, taskId = null) {
    super(`Needs approval: ${reasons.join('; ')}`);
    this.reasons = reasons;
    this.taskId = taskId;
  }
}
