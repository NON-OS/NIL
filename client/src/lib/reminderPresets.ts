// Quick picks for "remind me": soon, this evening, tomorrow morning, next Monday morning.
export default function reminderPresets(now = new Date()) {
  const at = (days: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.getTime();
  };
  const presets = [{ label: 'In 1 hour', at: now.getTime() + 3600_000 }];
  if (now.getHours() < 17) presets.push({ label: 'This evening, 6 pm', at: at(0, 18) });
  presets.push({ label: 'Tomorrow, 9 am', at: at(1, 9) });
  presets.push({ label: 'Next Monday, 9 am', at: at(((8 - now.getDay()) % 7) || 7, 9) });
  return presets;
}
