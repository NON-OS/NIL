// The events an agent's webhook can subscribe to. "ping" is the test delivery from Settings and
// is always sent when asked for.
const webhookEvents = Object.freeze(['task.assigned', 'task.updated', 'comment.created', 'task.due_soon', 'approval.decided']);

export default webhookEvents;
