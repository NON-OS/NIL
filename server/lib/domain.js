const domain = Object.freeze({
  statuses: Object.freeze(['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled']),
  recurrences: Object.freeze(['daily', 'weekdays', 'weekly', 'biweekly', 'monthly']),
  goalStatuses: Object.freeze(['on_track', 'at_risk', 'off_track', 'done']),
  roles: Object.freeze(['owner', 'admin', 'member']),
  colors: Object.freeze(['#3b4fe0', '#0e9384', '#d4582a', '#c2348a', '#7c4ddb', '#2f8a3b', '#b8860b', '#1f7fb8', '#d13f3f', '#5b6577']),
});

export default domain;
