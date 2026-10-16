export default interface CalendarFeed {
  // false when the server turned calendar feeds off
  enabled: boolean;
  feed: { url: string; createdAt: number; usedAt: number | null } | null;
}
