import { useEffect, useState } from 'react';
import Picker from '../ui/Picker';
import useStore from '../../state/useStore';
import toast from '../../state/toast';
import privacy from '../../actions/privacy';
import type Retention from '../../types/Retention';

const ROWS = [
  { key: 'doneDays', label: 'Finished and canceled tasks', hint: 'Including their comments and files. Receipts already exported stay valid.' },
  { key: 'commentDays', label: 'Comments', hint: 'On every task, open or not.' },
  { key: 'activityDays', label: 'Task history', hint: 'Who changed what and when.' },
] as const;

const label = (days: number) => (days === 0 ? 'Keep forever' : days === 1 ? 'After 1 day' : `After ${days} days`);

// Zero-state: the less you keep, the less there is to leak.
export default function RetentionCard() {
  const isAdmin = useStore((s) => s.me?.role !== 'member');
  const [data, setData] = useState<{ retention: Retention; allowed: number[] } | null>(null);

  useEffect(() => {
    privacy.get().then(setData).catch(toast.error);
  }, []);
  if (!data) return null;

  const change = async (key: keyof Retention, days: number) => {
    try {
      setData(await privacy.set({ [key]: days }));
      toast.show(days ? `Auto-erase set: ${label(days).toLowerCase()}.` : 'Kept forever.', { tone: 'success' });
    } catch (err) {
      toast.error(err);
    }
  };

  return (
    <div className="settings-card" style={{ paddingBlock: 6 }}>
      {ROWS.map((row) => (
        <div key={row.key} className="member" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
          <div>
            <div className="member-name">{row.label}</div>
            <div className="member-sub">{row.hint}</div>
          </div>
          <Picker
            title={`Auto-erase ${row.label.toLowerCase()}`}
            options={data.allowed.map((d) => ({ value: String(d), label: label(d) }))}
            value={String(data.retention[row.key])}
            onChange={(v) => change(row.key, Number(v))}
            className="btn btn-sm"
            width={180}
            align="end"
            disabled={!isAdmin}
          >
            {label(data.retention[row.key])}
          </Picker>
        </div>
      ))}
    </div>
  );
}
