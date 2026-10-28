import config from '../config.js';
import units from '../config/units.js';
import rateLimit from './rateLimit.js';

// Mentions in docs, per person. Each lands in someone's inbox, so a script can't send them in bulk.
export default rateLimit({
  windowMs: units.HOUR,
  max: config.docs.mentionsPerHour,
  key: (req) => req.user.id,
  message: 'You’ve mentioned a lot of people in the last hour. Wait a while and try again.',
});
