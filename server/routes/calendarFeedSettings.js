import express from 'express';
import config from '../config.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import feeds from '../calendar/feeds.js';

const router = express.Router();

const view = (feed) => ({
  enabled: config.calendarFeeds.enabled,
  feed: feed ? { url: `${config.appUrl}/api/calendar/${feed.token}.ics`, createdAt: feed.createdAt, usedAt: feed.usedAt } : null,
});

router.get('/me/calendar-feed', route((req) => view(config.calendarFeeds.enabled ? feeds.of(req.user.id) : null)));

// Makes the link, or a new one in place of the old, which stops working at once.
router.post(
  '/me/calendar-feed',
  route((req) => {
    if (!config.calendarFeeds.enabled) throw new HttpError(404, 'Calendar feeds are turned off on this server.');
    return view(feeds.rotate(req.user.id));
  }),
);

router.delete(
  '/me/calendar-feed',
  route((req) => {
    feeds.revoke(req.user.id);
    return view(null);
  }),
);

export default router;
