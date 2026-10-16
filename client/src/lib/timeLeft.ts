// "6d 4h left", "3h left", "12m left": how long until a deadline.
export default function timeLeft(until: number, now: number = Date.now()) {
  const minutes = Math.max(0, Math.round((until - now) / 60_000));
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h left`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days}d ${hours % 24}h left` : `${days}d left`;
}
