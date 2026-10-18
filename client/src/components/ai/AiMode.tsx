import { useEffect, useState } from 'react';
import { EyeOff, UserRound } from 'lucide-react';
import useStore from '../../state/useStore';
import aiMode from '../../actions/aiMode';
import anonymousAi from '../../actions/anonymousAi';

// Says how the next AI request from here goes, before anyone clicks: anonymous, with what that
// does and doesn't hide, or signed in and why. `compact` is the short tag next to a button,
// with the whole sentence on hover; `pointer` says where to set up anonymous requests.
export default function AiMode({ compact = false, pointer = true }: { compact?: boolean; pointer?: boolean }) {
  const aiAnonymous = useStore((s) => s.aiAnonymous);
  const me = useStore((s) => s.me);
  const mode = aiMode({ aiAnonymous, me });
  const [members, setMembers] = useState<number | null>(null);

  useEffect(() => {
    if (!mode.anonymous) return;
    let live = true;
    anonymousAi
      .credits()
      .then((c) => live && setMembers(c.members.length))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [mode.anonymous]);

  const among = members === null ? 'one of the members with a voting key' : `one of the ${members} members with a voting key`;
  const text = mode.anonymous
    ? `Sent anonymously: the server learns that ${among} asked, not which one.${members !== null && members < 3 ? ' With so few, that’s easy to guess.' : ''} This server and Anthropic still read the request, and its words, its timing and your IP address (unless you use Tor) can still point to you.`
    : `Sent signed in: the server knows this request is yours. ${mode.why}${mode.setUp && pointer ? ' Set them up in Settings, under Connect AI.' : ''}`;
  const Icon = mode.anonymous ? EyeOff : UserRound;

  if (compact) {
    return (
      <span className="muted" title={text} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)' }}>
        <Icon size={12} aria-hidden="true" />
        {mode.anonymous ? 'Anonymous' : 'Signed in'}
        <span className="sr-only">. {text}</span>
      </span>
    );
  }
  return (
    <p className="muted" data-ai-mode={mode.anonymous ? 'anonymous' : 'signed'} style={{ margin: 0, fontSize: 'var(--text-sm)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
      <Icon size={14} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
      <span>{text}</span>
    </p>
  );
}
