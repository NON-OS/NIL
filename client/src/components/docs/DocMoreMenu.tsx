import { useRef, useState } from 'react';
import { Download, History, MoreHorizontal, Printer, Trash2 } from 'lucide-react';
import Popover from '../ui/Popover';
import ConfirmButton from '../ui/ConfirmButton';

interface Props {
  onHistory: () => void;
  onDownload: () => void;
  onPrint: () => void;
  // left out for people who may not delete the doc
  onDelete?: () => void;
}

// The doc toolbar's quieter actions, named in full for touch screens. Delete sits apart at
// the bottom and asks twice, so a slip aimed at Print can't remove the doc for everyone.
export default function DocMoreMenu({ onHistory, onDownload, onPrint, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <>
      <button ref={anchor} type="button" className="btn btn-sm" onClick={() => setOpen((o) => !o)} aria-label="More doc actions" aria-expanded={open}>
        <MoreHorizontal />
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} width={240} align="end">
        <div className="menu-list">
          <button type="button" className="menu-item" onClick={run(onHistory)}>
            <History size={15} /> Version history
          </button>
          <button type="button" className="menu-item" onClick={run(onDownload)}>
            <Download size={15} /> Download as Markdown
          </button>
          <button type="button" className="menu-item" onClick={run(onPrint)}>
            <Printer size={15} /> Print or save as PDF
          </button>
          {onDelete && (
            <>
              <div className="menu-divider" />
              <ConfirmButton className="menu-item danger" onConfirm={run(onDelete)} confirmLabel="Delete for everyone?">
                <Trash2 size={15} /> Delete doc
              </ConfirmButton>
            </>
          )}
        </div>
      </Popover>
    </>
  );
}
