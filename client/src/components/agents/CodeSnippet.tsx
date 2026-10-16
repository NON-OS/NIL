import { Copy } from 'lucide-react';
import copyText from '../../lib/copyText';

export default function CodeSnippet({ label, text }: { label: string; text: string }) {
  return (
    <div className="snippet">
      <div className="snippet-head">
        <span className="eyebrow">{label}</span>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => copyText(text)}>
          <Copy /> Copy
        </button>
      </div>
      <pre>{text}</pre>
    </div>
  );
}
