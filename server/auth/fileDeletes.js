import config from '../config.js';
import units from '../config/units.js';
import rateLimit from './rateLimit.js';

// Deletes in Files and of encrypted files in docs, counted per person: folders, the things in
// them and blobs. A bulk delete counts once.
export default rateLimit({
  windowMs: units.MINUTE,
  max: config.files.deletesPerMinute,
  key: (req) => req.user.id,
  message: 'You’ve deleted a lot in the last minute. Wait a moment and try again.',
});
