import envNumber from '../lib/envNumber.js';
import units from './units.js';

// Team chat. Each channel's messages are encrypted under an epoch key that its members' browsers
// replace when someone joins or leaves and, at the latest, every CHAT_EPOCH_HOURS (a week at most,
// which browsers hold to whatever this says), so a key that
// leaks opens only a stretch of a channel. The rest are caps on what one request or one person may send.
export default Object.freeze({
  epochMs: envNumber('CHAT_EPOCH_HOURS', 24, { min: 1, max: 24 * 7 }) * units.HOUR,
  // a forward-secret conversation keeps its old keys at least a day and at most this many days
  maxForwardDays: envNumber('CHAT_MAX_FORWARD_DAYS', 365, { min: 1 }),
  // marks of tabs that have sent nothing in this long are dropped
  markDays: envNumber('CHAT_MARK_DAYS', 90, { min: 1 }),
  // one encrypted message, signature and file keys included
  messageChars: envNumber('CHAT_MESSAGE_KB', 64, { min: 4, max: 1024 }) * 1024,
  // the encrypted messages one person may keep on the server
  memberBytes: envNumber('CHAT_MEMBER_MB', 1024, { min: 1 }) * units.MB,
  messagesPerMinute: envNumber('CHAT_MESSAGES_PER_MINUTE', 120, { min: 1 }),
  channelsPerHour: envNumber('CHAT_CHANNELS_PER_HOUR', 30, { min: 1 }),
  // channels for the whole team one person may have made, since everyone gets them and can't leave
  teamChannelsPerPerson: envNumber('CHAT_TEAM_CHANNELS_PER_PERSON', 25, { min: 1 }),
  // new keys, handed-on keys, leavings and settings changes one person may make a minute
  keyChangesPerMinute: envNumber('CHAT_KEY_CHANGES_PER_MINUTE', 30, { min: 1 }),
  // new keys one conversation may get a day, whoever starts them
  epochsPerDay: envNumber('CHAT_EPOCHS_PER_DAY', 200, { min: 10 }),
  maxMembers: envNumber('CHAT_MAX_MEMBERS', 500, { min: 2, max: 5000 }),
  groupMax: envNumber('CHAT_GROUP_MAX', 12, { min: 3, max: 50 }),
  pageSize: envNumber('CHAT_PAGE_SIZE', 60, { min: 10, max: 200 }),
  // how far a browser's clock may be from the server's when it seals a message
  clockSkewMs: envNumber('CHAT_CLOCK_SKEW_SECONDS', 600, { min: 30 }) * units.SECOND,
  // files sent and never posted in a message go after this long
  unpostedFileMs: envNumber('CHAT_UNPOSTED_FILE_MINUTES', 60, { min: 5 }) * units.MINUTE,
  // the longest a channel can keep disappearing messages, and how often expired ones are removed
  maxDisappearSeconds: envNumber('CHAT_MAX_DISAPPEAR_DAYS', 90, { min: 1 }) * 86_400,
  sweepMs: envNumber('JOB_CHAT_SWEEP_SECONDS', 60, { min: 5 }) * units.SECOND,
  // at most one push per person and channel in this long; the app shows the rest
  pushQuietMs: envNumber('CHAT_PUSH_QUIET_SECONDS', 60, { min: 0 }) * units.SECOND,
});
