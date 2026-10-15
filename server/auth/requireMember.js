import guestScope from '../services/guestScope.js';

// Guests work inside the projects shared with them; workspace-wide things are for members.
export default function requireMember(req, res, next) {
  if (guestScope.of(req.user.id)) return res.status(403).json({ error: 'Guests can only work inside the projects shared with them.' });
  next();
}
