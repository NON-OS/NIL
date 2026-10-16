import envNumber from '../lib/envNumber.js';

// Personal calendar feeds (ICS). "off" turns the feature off and every existing link with it.
export default Object.freeze({
  enabled: process.env.CALENDAR_FEEDS !== 'off',
  perHour: envNumber('CALENDAR_FEED_PER_HOUR', 30, { min: 1 }),
});
