import config from '../config.js';
import units from '../config/units.js';
import rateLimit from './rateLimit.js';

// Docs saved and comments written, counted per person across both. The editor saves at most
// once a second or so while someone types, so only a script writing in a loop meets the limit.
export default rateLimit({
  windowMs: units.MINUTE,
  max: config.uploads.writesPerMinute,
  key: (req) => req.user.id,
  message: 'You’ve saved a lot in the last minute. Wait a moment and try again.',
});
