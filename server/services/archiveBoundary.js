import sql from '../db/sql.js';
import config from '../config.js';
import visibleSql from './visibleSql.js';

const DAY = 86_400_000;

// Where someone's archive starts: closed tasks they can see that were last touched before this
// time stay on the server. It's the configured number of days ago, moved later when even that
// window holds more closed tasks than the app should start with.
export default function archiveBoundary(viewerId, now = Date.now()) {
  const since = now - config.tasks.recentClosedDays * DAY;
  const visible = visibleSql(viewerId);
  const last = sql.get(
    `SELECT updated_at FROM tasks WHERE deleted_at IS NULL AND status IN ('done', 'canceled') AND updated_at >= ? AND ${visible.where}
     ORDER BY updated_at DESC LIMIT 1 OFFSET ?`,
    since,
    ...visible.params,
    config.tasks.recentClosedMax - 1,
  );
  return last ? last.updated_at : since;
}
