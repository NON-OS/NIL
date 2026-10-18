import config from '../config.js';
import calendar from '../lib/calendar.js';

const DAY = 86_400_000;

// What the purge erases whatever the zero-state policies say, once it has done its job, as
// [table, where, ...params] for db/deleteSome.js. The sign-in audit trail is history, so it
// follows the task history policy when one is set.
export default function expiredRows(now, policy) {
  const history = now - config.usedInviteDays * DAY;
  const dead = now - config.keep.expiredDays * DAY;
  const rows = [
    ['notifications', 'read_at IS NOT NULL AND read_at < ?', now - config.readNotificationDays * DAY],
    ['sessions', 'expires_at < ?', now],
    // unused invite links go once they expire; links people joined through stay a while longer,
    // so admins can still see who came in with them
    ['invites', '(uses = 0 AND expires_at < ?) OR expires_at < ? OR revoked_at < ?', now, history, history],
    // a sent reminder lives on as its notification; the row and its note have no use left
    ['reminders', 'sent_at IS NOT NULL'],
    ['share_links', 'revoked_at < ? OR expires_at < ?', dead, dead],
    ['sign_in_resets', 'closed_at < ? OR used_at < ? OR expires_at < ?', dead, dead, dead],
    ['api_tokens', 'expires_at < ?', dead],
    // A private payout's one-time address must never be handed out twice. Once a payment was
    // recorded, the payment row carries the address; one nobody recorded stays, since it may
    // have been paid all the same.
    ['payment_intents', 'expires_at < ? AND (stealth_ephemeral IS NULL OR id IN (SELECT intent_id FROM payments WHERE intent_id IS NOT NULL))', dead],
    [
      'proposal_power',
      `proposal_id IN (SELECT id FROM proposals WHERE closed_at < ? AND result IS NOT NULL)
       AND NOT EXISTS (SELECT 1 FROM votes v WHERE v.proposal_id = proposal_power.proposal_id AND v.user_id = proposal_power.user_id)`,
      now - config.keep.votePowerDays * DAY,
    ],
    // a notice only stops a second one for the same due date, which is past; a day's margin
    // covers time zones
    ['agent_due_notices', 'due_date < ?', calendar.addDays(calendar.today(), -1)],
  ];
  if (policy.activityDays) rows.push(['sign_in_audit', 'created_at < ?', now - policy.activityDays * DAY]);
  return rows;
}
