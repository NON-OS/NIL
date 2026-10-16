import express from 'express';
import config from '../config.js';
import route from '../lib/route.js';
import HttpError from '../lib/HttpError.js';
import feeds from '../calendar/feeds.js';
import feedBase from '../calendar/feedBase.js';

const router = express.Router();

const view = (req, feed) => ({
  enabled: config.calendarFeeds.enabled,
  feed: feed ? { url: `${feedBase(req)}/api/calendar/${feed.token}.ics`, createdAt: feed.createdAt, usedAt: feed.usedAt } : null,
});

router.get('/me/calendar-feed', route((req) => view(req, config.calendarFeeds.enabled ? feeds.of(req.user.id) : null)));

// Makes the link, or a new one in place of the old, which stops working at once.
router.post(
  '/me/calendar-feed',
  route((req) => {
    if (!config.calendarFeeds.enabled) throw new HttpError(404, 'Calendar feeds are turned off on this server.');
    return view(req, feeds.rotate(req.user.id));
  }),
);

router.delete(
  '/me/calendar-feed',
  route((req) => {
    feeds.revoke(req.user.id);
    return view(req, null);
  }),
);

export default router;
