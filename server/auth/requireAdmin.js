export default function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ error: 'Only workspace admins can do this.' });
  next();
}
