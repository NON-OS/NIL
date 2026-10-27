import Meter from '../charts/Meter';
import fileSize from '../../lib/fileSize';
import type FilesOverview from '../../types/FilesOverview';

// How much of your file space your files take: attachments, Files and files in docs together,
// encrypted sizes, since that's what the server holds.
export default function StorageMeter({ usage }: { usage: FilesOverview['usage'] }) {
  if (!usage.quota) {
    return <p className="files-storage muted num">{fileSize(usage.used)} of files stored</p>;
  }
  const near = usage.used / usage.quota > 0.9;
  return (
    <div className="files-storage">
      <Meter label="Your file space" value={usage.used} total={usage.quota} color={near ? 'var(--danger)' : 'var(--accent-line)'} caption={`${fileSize(usage.used)} of ${fileSize(usage.quota)}`} />
    </div>
  );
}
