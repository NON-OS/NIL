import type { ReactNode } from 'react';
import type LinkRenderer from '../../types/LinkRenderer';

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(~~[^~]+~~)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|((?:^|(?<=\s))@[A-Za-z0-9][\w.-]*)/g;

function safeHref(url: string) {
  return /^(https?:|mailto:)/i.test(url) ? url : null;
}

// The inline part of the Markdown subset: code, bold, strike, italics, links and @mentions.
// Everything becomes React elements; no text is ever treated as HTML.
export default function markdownInline(text: string, keyPrefix: string, renderLink?: LinkRenderer): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    const t = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (m[1]) out.push(<code key={key}>{t.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={key}>{markdownInline(t.slice(2, -2), key, renderLink)}</strong>);
    else if (m[3]) out.push(<s key={key}>{markdownInline(t.slice(2, -2), key, renderLink)}</s>);
    else if (m[4]) out.push(<em key={key}>{markdownInline(t.slice(1, -1), key, renderLink)}</em>);
    else if (m[5]) {
      const [, label, url] = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t)!;
      const href = safeHref(url);
      out.push(href ? <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow">{label}</a> : renderLink?.(url, label, key) ?? label);
    } else if (m[6]) out.push(<a key={key} href={t} target="_blank" rel="noopener noreferrer nofollow">{t}</a>);
    else if (m[7]) out.push(<span key={key} className="mention">{t}</span>);
    last = start + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
