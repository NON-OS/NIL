import config from '../config.js';
import units from '../config/units.js';
import rateLimit from '../auth/rateLimit.js';

// New epochs counted per conversation as well as per person, so its members together can't
// flood it with key changes that every browser then has to check.
export default rateLimit({ windowMs: units.MINUTE, max: config.chat.keyChangesPerMinute, key: (req) => `chat:${req.params.id}`, message: 'This conversation’s key changed a lot in the last minute. Wait a moment and try again.' });
