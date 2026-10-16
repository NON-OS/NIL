import sql from '../db/sql.js';
import config from '../config.js';
import loadTask from '../services/loadTask.js';
import canSeeTask from '../services/canSeeTask.js';
import subscriptions from './subscriptions.js';
import pushPayload from './pushPayload.js';
import sendPush from './sendPush.js';

const URGENT = new Set(['reminder', 'due_soon']);

async function deliver(userId, notification) {
  const devices = subscriptions.of(userId);
  if (!devices.length) return;
  const task = notification.taskId ? loadTask(notification.taskId) : null;
  // checked again here, at sending time: the task may have gone private or away meanwhile
  if (notification.taskId && (!task || task.deletedAt || !canSeeTask(task, { id: userId }))) return;
  const actorName = notification.actorId ? sql.get('SELECT name FROM users WHERE id = ?', notification.actorId)?.name : null;

  await Promise.all(
    devices.map(async (device) => {
      const message = pushPayload({ ...notification, task, actorName, names: Boolean(device.show_names) });
      if (!message) return;
      const result = await sendPush(device, message, { urgency: URGENT.has(notification.type) ? 'high' : 'normal' });
      if (result === 'gone') subscriptions.drop(device.id);
      else if (result === 'sent') subscriptions.touch(device.id);
    }),
  );
}

// Sends a notification that was just stored to every device where the person turned push on.
// It runs after the current request and never throws: if a push service is down, the
// notification still waits in the app's inbox.
export default function pushNotification(userId, notification) {
  if (!config.push.enabled || !pushPayload.types.has(notification.type)) return;
  setImmediate(() => deliver(userId, notification).catch((err) => console.error('[push] could not deliver:', err.message)));
}
