import { useState } from 'react';
import { Copy, Sparkles } from 'lucide-react';
import Markdown from '../ui/Markdown';
import Spinner from '../ui/Spinner';
import toast from '../../state/toast';
import ai from '../../actions/ai';
import AiMode from '../ai/AiMode';

// The weekly brief is generated on demand and kept only in this tab.
export default function BriefPanel() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      setText((await ai.brief()).text);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.show('Brief copied. Paste it into your team chat.', { tone: 'success' });
    } catch {
      toast.show('Couldn’t reach the clipboard. Select the text and copy it instead.', { tone: 'error' });
    }
  };

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={15} color="var(--accent-text)" /> Weekly brief
        </h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {text && (
            <button type="button" className="btn btn-sm" onClick={copy}>
              <Copy /> Copy
            </button>
          )}
          <button type="button" className="btn btn-sm btn-primary" onClick={run} disabled={busy}>
            {busy && <Spinner size={12} />} {text ? 'Rewrite' : 'Write this week’s brief'}
          </button>
        </div>
      </div>
      <div className="panel-body" style={{ display: 'grid', gap: 10 }}>
        {text ? (
          <Markdown text={text} />
        ) : (
          <p className="muted">
            {busy ? 'Reading this week’s work…' : 'Get a short summary of wins, risks and next week’s focus, ready to share with the team.'}
          </p>
        )}
        <AiMode />
      </div>
    </section>
  );
}
