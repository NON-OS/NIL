const MINUTE = 60_000;

// Quick picks for "remind me": before the task's due time when it has one, then soon, this
// evening, tomorrow morning and next Monday morning.
export default function reminderPresets(now = new Date(), dueAt: number | null = null) {
  const at = (days: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.getTime();
  };
  const presets: { label: string; at: number }[] = [];
  if (dueAt) {
    for (const [label, before] of [['1 hour before it’s due', 60], ['15 minutes before it’s due', 15], ['When it’s due', 0]] as const) {
      if (dueAt - before * MINUTE > now.getTime() + MINUTE) presets.push({ label, at: dueAt - before * MINUTE });
    }
  }
  presets.push({ label: 'In 1 hour', at: now.getTime() + 60 * MINUTE });
  if (now.getHours() < 17) presets.push({ label: 'This evening, 6 pm', at: at(0, 18) });
  presets.push({ label: 'Tomorrow, 9 am', at: at(1, 9) });
  presets.push({ label: 'Next Monday, 9 am', at: at(((8 - now.getDay()) % 7) || 7, 9) });
  return presets;
}
