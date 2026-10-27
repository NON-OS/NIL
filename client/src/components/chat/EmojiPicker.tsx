import { useRef, useState } from 'react';
import { SmilePlus } from 'lucide-react';
import Popover from '../ui/Popover';

const QUICK = ['👍', '❤️', '😂', '🎉', '👀', '🙏', '✅', '🔥', '😮', '😢', '🚀', '💯'];

// A short set of reactions, which covers what teams use. Reactions are encrypted like messages.
export default function EmojiPicker({ onPick, label = 'Add a reaction' }: { onPick: (emoji: string) => void; label?: string }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button ref={anchor} type="button" className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label={label} title={label} aria-expanded={open}>
        <SmilePlus size={15} />
      </button>
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} align="end">
        <div className="emoji-pick" role="group" aria-label="Reactions">
          {QUICK.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => {
                setOpen(false);
                onPick(e);
              }}
              aria-label={`React with ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}
