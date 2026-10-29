import config from '../config.js';
import units from '../config/units.js';
import rateLimit from './rateLimit.js';

// Folders handed to people, counted per person. A team folder's grant tells the whole team, so a
// script handing folders out in a loop is slowed down.
export default rateLimit({
  windowMs: units.MINUTE,
  max: config.files.grantsPerMinute,
  key: (req) => req.user.id,
  message: 'You’ve shared a lot in the last minute. Wait a moment and try again.',
});
