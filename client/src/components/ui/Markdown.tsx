import './Markdown.css';
import { Fragment, type ReactNode } from 'react';
import inline from './markdownInline';
import headingId from '../../lib/headingId';
import type LinkRenderer from '../../types/LinkRenderer';

interface Props {
  text: string;
  // draws links that aren't web or mail addresses; without it they show as plain text
  renderLink?: LinkRenderer;
  // gives headings ids, so a link can point at a section
  anchors?: boolean;
  // the heading level a single # becomes, so headings follow on from the page around the text
  headingLevel?: number;
}

const TABLE_RULE = /^\s*\|?[\s:|-]*-{3,}[\s:|-]*$/;
const cells = (row: string) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

// A deliberately small Markdown subset rendered to React elements.
// Nothing is ever injected as HTML, so user text can't smuggle in markup or script.
export default function Markdown({ text, renderLink, anchors = false, headingLevel = 3 }: Props) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  const ids = new Map<string, number>();
  let i = 0;

  // repeated headings get -1, -2… like GitHub, so every anchor stays unique
  const idFor = (title: string) => {
    const base = headingId(title.replace(/`/g, ''));
    const seen = ids.get(base) ?? 0;
    ids.set(base, seen + 1);
    return seen ? `${base}-${seen}` : base;
  };

  while (i < lines.length) {
    const line = lines[i];
    const key = `b${i}`;

    if (/^```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push(<pre key={key}><code>{body.join('\n')}</code></pre>);
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      const depth = heading[1].length;
      const Tag = `h${Math.min(6, headingLevel + depth - 1)}` as 'h1';
      blocks.push(<Tag key={key} className={`md-h${depth}`} id={anchors ? idFor(heading[2]) : undefined}>{inline(heading[2], key, renderLink)}</Tag>);
      i++;
      continue;
    }

    if (/^\s*\|/.test(line) && TABLE_RULE.test(lines[i + 1] ?? '')) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
      blocks.push(
        <div key={key} className="md-table">
          <table>
            <thead>
              <tr>{head.map((c, j) => <th key={j}>{inline(c, `${key}-h${j}`, renderLink)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>{row.map((c, j) => <td key={j}>{inline(c, `${key}-${r}-${j}`, renderLink)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+[.)]\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]\s+/.test(line);
      const items: ReactNode[] = [];
      while (i < lines.length && (ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/).test(lines[i])) {
        const content = lines[i].replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/, '');
        const task = /^\[([ xX])\]\s+(.*)$/.exec(content);
        items.push(
          task ? (
            <li key={i} className="task">
              <input type="checkbox" checked={task[1] !== ' '} readOnly disabled />
              {inline(task[2], `${key}-${i}`, renderLink)}
            </li>
          ) : (
            <li key={i}>{inline(content, `${key}-${i}`, renderLink)}</li>
          ),
        );
        i++;
      }
      blocks.push(ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(<blockquote key={key}>{inline(quote.join(' '), key, renderLink)}</blockquote>);
      continue;
    }

    if (!line.trim()) {
      i++;
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(```|#{1,3}\s|>|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(
      <p key={key}>
        {para.map((p, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(p, `${key}-${j}`, renderLink)}
          </Fragment>
        ))}
      </p>,
    );
  }

  return <div className="md">{blocks}</div>;
}
