import config from '../config.js';
import units from '../config/units.js';
import rateLimit from './rateLimit.js';

// Encrypted uploads finished, counted per person. Finishing checks every chunk of the file on disk,
// so asking again and again is slowed down.
export default rateLimit({
  windowMs: units.MINUTE,
  max: config.files.finishesPerMinute,
  key: (req) => req.user.id,
  message: 'You’ve finished a lot of uploads in the last minute. Wait a moment and try again.',
});
