import config from '../config.js';
import units from '../config/units.js';
import rateLimit from './rateLimit.js';

// Live doc changes, per person. Typing sends a few a second, batched; only a script meets this.
export default rateLimit({
  windowMs: units.MINUTE,
  max: config.docs.updatesPerMinute,
  key: (req) => req.user.id,
  message: 'You’ve sent a lot of changes in the last minute. Wait a moment and try again.',
});
