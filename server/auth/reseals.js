import config from '../config.js';
import units from '../config/units.js';
import rateLimit from './rateLimit.js';

// Taking and swapping in files being encrypted again after someone left a folder or doc, counted
// per person.
export default rateLimit({
  windowMs: units.MINUTE,
  max: config.files.resealsPerMinute,
  key: (req) => req.user.id,
  message: 'Nil is encrypting files again faster than this server allows. It carries on in a moment.',
});
