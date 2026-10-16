import http from '../api/http';
import type CalendarFeed from '../types/CalendarFeed';

const calendarFeed = {
  get: () => http.get<CalendarFeed>('/me/calendar-feed'),
  // makes the link, or a new one that replaces it; the old one stops working at once
  renew: () => http.post<CalendarFeed>('/me/calendar-feed'),
  turnOff: () => http.del<CalendarFeed>('/me/calendar-feed'),
};

export default calendarFeed;
