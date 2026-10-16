import envNumber from '../lib/envNumber.js';

// When due-soon notes go out: this many minutes before a due time, and at this hour (in the
// person's time zone) on the day a task without a time is due.
export default Object.freeze({
  soonMinutes: envNumber('DUE_SOON_MINUTES', 30, { min: 1, max: 1440 }),
  dayHour: envNumber('DUE_DAY_HOUR', 9, { max: 23 }),
});
