import express from 'express';
import config from '../config.js';
import rateLimit from '../auth/rateLimit.js';
import feeds from '../calendar/feeds.js';
import buildCalendar from '../calendar/buildCalendar.js';

const router = express.Router();
const HOUR = 3_600_000;
const tokenOf = (req) => String(req.params.file).replace(/\.ics$/, '');

// Calendar apps fetch from shared addresses (one Google server polls for many people), so the
// limit per address is looser than the limit per link.
const perAddress = rateLimit({ windowMs: HOUR, max: config.calendarFeeds.perHour * 10, message: 'Too many calendar requests. Try again later.' });
const perLink = rateLimit({ windowMs: HOUR, max: config.calendarFeeds.perHour, key: tokenOf, message: 'This calendar link is being checked too often. Try again later.' });

// A person's calendar feed, for calendar apps. The secret link is the only key: no cookie, no
// sign-in. It shows nothing once it's replaced or turned off.
router.get('/calendar/:file', perAddress, perLink, (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  const feed = config.calendarFeeds.enabled ? feeds.open(tokenOf(req)) : null;
  if (!feed) return res.status(404).type('text/plain').send('This calendar link was turned off or replaced.');
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'inline; filename="nil.ics"');
  res.send(buildCalendar(feed.userId, { appUrl: config.appUrl }));
});

export default router;
