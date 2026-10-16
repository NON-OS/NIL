import './InboxView.css';
import { useEffect, useMemo, useState } from 'react';
import { BellRing, CheckCheck } from 'lucide-react';
import ViewHeader from '../components/shell/ViewHeader';
import Avatar from '../components/ui/Avatar';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import useStore from '../state/useStore';
import useNow from '../hooks/useNow';
import inbox from '../actions/inbox';
import detail from '../actions/detail';
import archive from '../actions/archive';
import describeNotification from '../lib/describeNotification';
import systemNotice from '../lib/systemNotice';
import dates from '../lib/dates';
import cx from '../lib/cx';
import type InboxItem from '../types/InboxItem';
import router from '../lib/router';

type Tab = 'all' | 'unread' | 'mentions';

function dayLabel(ts: number) {
  const day = dates.toISO(new Date(ts));
  const diff = dates.diff(dates.today(), day);
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : diff < 7 ? dates.DAYS_LONG[dates.parse(day).getDay()] : dates.short(day);
}

export default function InboxView() {
  const items = useStore((s) => s.inbox);
  const users = useStore((s) => s.users);
  const tasks = useStore((s) => s.tasks);
  const prefix = useStore((s) => s.workspace.taskPrefix);
  const unread = useStore((s) => s.unread);
  const [tab, setTab] = useState<Tab>('all');
  useNow();

  useEffect(() => {
    inbox.load();
  }, []);

  // notifications can point at older finished tasks, which wait in the archive
  useEffect(() => {
    if (items) archive.find(items.map((n) => n.taskId)).catch(() => {});
  }, [items]);

  const shown = useMemo(() => {
    const list = (items ?? []).filter((n) => (tab === 'unread' ? !n.readAt : tab === 'mentions' ? n.type === 'mention' : true));
    const groups: { label: string; items: InboxItem[] }[] = [];
    for (const n of list) {
      const label = dayLabel(n.createdAt);
      if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
      groups.at(-1)!.items.push(n);
    }
    return groups;
  }, [items, tab]);

  const open = (n: InboxItem) => {
    if (!n.readAt) inbox.markRead([n.id]);
    const task = n.taskId ? tasks[n.taskId] : undefined;
    if (task) detail.open(task);
    else if (n.type === 'proposal') router.navigate('/votes');
    else if (n.type === 'plan_ending') router.navigate('/settings?tab=plan');
    else if (n.type.startsWith('agent_')) router.navigate('/settings?tab=agents');
  };

  return (
    <div className="main">
      <ViewHeader
        title="Inbox"
        subtitle={unread ? `${unread} unread` : 'All caught up'}
        actions={
          unread > 0 && (
            <button type="button" className="btn" onClick={inbox.markAllRead}>
              <CheckCheck /> Mark all read
            </button>
          )
        }
      />
      <div className="page page-narrow">
        <div className="inbox-tabs" role="tablist">
          {(['all', 'unread', 'mentions'] as Tab[]).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
              {t === 'all' ? 'All' : t === 'unread' ? 'Unread' : 'Mentions'}
            </button>
          ))}
        </div>

        {items === null ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 40 }}>
            <Spinner size={22} />
          </div>
        ) : shown.length === 0 ? (
          <EmptyState icon={<BellRing />} title={tab === 'all' ? 'Nothing here yet' : 'Nothing to show'}>
            You’ll hear about tasks assigned to you, comments on things you follow, and when someone @mentions you.
          </EmptyState>
        ) : (
          shown.map((g) => (
            <section key={g.label}>
              <h2 className="eyebrow inbox-day">{g.label}</h2>
              <ul className="inbox-list">
                {g.items.map((n) => {
                  const actor = n.actorId ? users[n.actorId] : undefined;
                  const task = n.taskId ? tasks[n.taskId] : undefined;
                  const notice = systemNotice(n);
                  return (
                    <li key={n.id}>
                      <button type="button" className={cx('inbox-item', !!n.readAt && 'read')} onClick={() => open(n)}>
                        <span className="unread-dot" aria-label={n.readAt ? undefined : 'Unread'} />
                        <Avatar user={actor} size={28} />
                        <span className="inbox-text">
                          <span>
                            <strong>{notice ? notice.heading : n.type === 'application' ? n.data.name : actor?.name ?? 'Someone'}</strong> {notice ? '' : describeNotification(n)}{' '}
                          </span>
                          <span className="task">
                            {task && <span className="key mono">{prefix}-{task.number}</span>}
                            {notice?.text || (task?.title ?? n.data.title ?? (n.type.startsWith('agent_') ? n.data.reason ?? 'Settings → Agents' : 'a deleted task'))}
                          </span>
                          {n.data.excerpt && <span className="inbox-excerpt">{n.data.excerpt}</span>}
                        </span>
                        <time title={dates.dateTime(n.createdAt)}>{dates.ago(n.createdAt)}</time>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
