// Lock screens show notifications to anyone nearby, so the text stays short.
const MAX_BODY = 160;

const clip = (text) => {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > MAX_BODY ? `${s.slice(0, MAX_BODY - 1)}…` : s;
};

// The generic line a private task gets, whatever the device settings.
const PRIVATE = {
  reminder: 'Reminder',
  assigned: 'A private task was assigned to you',
  mention: 'You were mentioned on a private task',
  due_soon: 'A private task is due',
  due_today: 'A private task is due',
};

// What a push notification says, from a notification that was just stored. Only reminders,
// assignments, mentions and due notes are pushed; anything else returns null.
//
// A private task never gets more than its generic line and its id, which lets the app open it
// once the person unlocks. `names` is the device's "Show task names in notifications" choice;
// with it off, team notifications say only what happened, without task or people's names.
// Comment text is never included.
export default function pushPayload({ id, type, task, data = {}, actorName, names }) {
  if (!(type in PRIVATE)) return null;
  const tag = `nil-${id}`;
  if (task?.private) return { title: PRIVATE[type], task: task.id, tag };

  const actor = actorName || 'Someone';
  const named = (title, body) => ({ title, ...(body ? { body: clip(body) } : {}), ...(task ? { task: task.id } : {}), tag });
  const taskTitle = names ? task?.title : null;

  switch (type) {
    case 'reminder':
      return named('Reminder', task ? taskTitle : names ? data.note : null);
    case 'assigned':
      return named(names ? `${actor} assigned you a task` : 'A task was assigned to you', taskTitle);
    case 'mention':
      return named(names ? `${actor} mentioned you` : 'You were mentioned on a task', taskTitle);
    case 'due_soon':
      return named('Due soon', taskTitle);
    case 'due_today':
      return task ? named('Due today', taskTitle) : named(`${data.count} tasks are due today`);
    default:
      return null;
  }
}

pushPayload.types = new Set(Object.keys(PRIVATE));
