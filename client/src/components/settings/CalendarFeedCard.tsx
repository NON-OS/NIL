import { useEffect, useState } from 'react';
import { CalendarPlus, Copy, TriangleAlert } from 'lucide-react';
import ConfirmButton from '../ui/ConfirmButton';
import toast from '../../state/toast';
import calendarFeed from '../../actions/calendarFeed';
import dates from '../../lib/dates';
import type CalendarFeed from '../../types/CalendarFeed';

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.show('Copied. Paste it into your calendar app.', { tone: 'success' });
  } catch {
    toast.show('Couldn’t reach the clipboard. Select the link and copy it.', { tone: 'error' });
  }
}

// A secret calendar link for the tasks assigned to you, for Google Calendar, Apple Calendar,
// Outlook and the like. It can be shown again, replaced or turned off at any time.
export default function CalendarFeedCard() {
  const [state, setState] = useState<CalendarFeed | null>(null);

  useEffect(() => {
    calendarFeed.get().then(setState).catch(toast.error);
  }, []);

  const change = (work: () => Promise<CalendarFeed>, message: string) =>
    work()
      .then((next) => {
        setState(next);
        toast.show(message, { tone: 'success' });
      })
      .catch(toast.error);

  if (!state) return null;
  const feed = state.feed;

  return (
    <section className="settings-section">
      <h2>Calendar feed</h2>
      <p>See the tasks assigned to you that have a due date in your own calendar app. Calendar apps check the link for changes every so often, usually within a few hours.</p>
      <div className="settings-card">
        {!state.enabled ? (
          <span className="muted">Calendar feeds are turned off on this server.</span>
        ) : !feed ? (
          <div>
            <button type="button" className="btn btn-primary" onClick={() => change(calendarFeed.renew, 'Calendar link created.')}>
              <CalendarPlus /> Create calendar link
            </button>
          </div>
        ) : (
          <>
            <div className="invite-link">
              <input className="input" readOnly value={feed.url} onFocus={(e) => e.target.select()} aria-label="Calendar link" />
              <button type="button" className="btn" onClick={() => copy(feed.url)}>
                <Copy /> Copy
              </button>
            </div>
            <div className="feed-warning" role="note">
              <TriangleAlert size={15} aria-hidden="true" />
              <span>
                Anyone with this link can see the tasks assigned to you that have a due date: their names, dates and links. Private tasks show only as “Private task”, with no details. Don’t share it. If it gets out, make a new link.
              </span>
            </div>
            <div className="settings-row">
              <a className="btn" href={feed.url.replace(/^https?:/, 'webcal:')}>
                Open in calendar app
              </a>
              <ConfirmButton className="btn" confirmLabel="The old link stops working. Click again" onConfirm={() => change(calendarFeed.renew, 'New calendar link made. The old one no longer works.')}>
                Make a new link
              </ConfirmButton>
              <ConfirmButton onConfirm={() => change(calendarFeed.turnOff, 'Calendar link turned off.')}>Turn off</ConfirmButton>
            </div>
            <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>
              Made {dates.dateTime(feed.createdAt)}. {feed.usedAt ? `Last checked by a calendar app ${dates.ago(feed.usedAt)}.` : 'No calendar app has used it yet.'}
            </span>
          </>
        )}
      </div>
    </section>
  );
}
