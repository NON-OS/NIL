import config from '../config.js';
import units from '../config/units.js';
import rateLimit from '../auth/rateLimit.js';

// New epochs, handed-on keys, leavings and settings changes, counted per person: each one makes
// every member's browser check a signature chain, so a member can't flood a conversation with them.
export default rateLimit({ windowMs: units.MINUTE, max: config.chat.keyChangesPerMinute, key: (req) => req.user.id, message: 'Too many changes to this conversation in the last minute. Wait a moment and try again.' });
