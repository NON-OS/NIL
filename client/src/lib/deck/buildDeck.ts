import logoPng from './logoPng';
import type DeckFacts from '../../types/DeckFacts';
import type DeckNarrative from '../../types/DeckNarrative';
import countOf from '../../lib/countOf';

// NØNOS brand on a slide: white ground, ink type, cyan as a fill, brand type cyan for small
// numbers and rules, Geist and JetBrains Mono (PowerPoint substitutes if they're missing).
const INK = '0A0B0D';
const MUTED = '676C77';
const LINE = 'E2E4EA';
const CYAN = '66FFFF';
const TEAL = '007C85';
const PAPER = 'F2F3F7';
const SANS = 'Geist';
const MONO = 'JetBrains Mono';

type Pptx = InstanceType<typeof import('pptxgenjs').default>;
type Slide = ReturnType<Pptx['addSlide']>;
type Line = DeckFacts['shipped'][number];

function frame(pptx: Pptx, index: number, label: string, title: string) {
  const slide = pptx.addSlide();
  slide.background = { color: 'FFFFFF' };
  slide.addText(`${String(index).padStart(2, '0')}  ${label.toUpperCase()}`, { x: 0.6, y: 0.45, w: 8, h: 0.3, fontFace: MONO, fontSize: 10, color: TEAL, charSpacing: 2 });
  slide.addText(title, { x: 0.6, y: 0.8, w: 12, h: 0.8, fontFace: SANS, fontSize: 30, color: INK });
  slide.addShape(pptx.ShapeType.line, { x: 0.6, y: 1.65, w: 1.4, h: 0, line: { color: TEAL, width: 1 } });
  slide.addText(String(index).padStart(2, '0'), { x: 12.1, y: 6.95, w: 0.6, h: 0.3, fontFace: MONO, fontSize: 9, color: MUTED, align: 'right' });
  slide.addShape(pptx.ShapeType.rect, { x: 12.83, y: 6.98, w: 0.12, h: 0.24, fill: { color: CYAN }, line: { color: CYAN } });
  return slide;
}

function list(slide: Slide, items: Line[], { x = 0.6, y = 2.0, w = 12.1, empty = 'Nothing here.' } = {}) {
  if (!items.length) {
    slide.addText(empty, { x, y, w, h: 0.5, fontFace: SANS, fontSize: 16, color: MUTED });
    return;
  }
  const rows = items.map((t) => [
    { text: t.key, options: { fontFace: MONO, fontSize: 11, color: TEAL } },
    { text: t.title, options: { fontFace: SANS, fontSize: 14, color: INK } },
    { text: [t.who, t.due].filter(Boolean).join(' · '), options: { fontFace: SANS, fontSize: 11, color: MUTED, align: 'right' as const } },
  ]);
  slide.addTable(rows, { x, y, w, colW: [1.2, w - 3.9, 2.7], rowH: 0.36, border: { type: 'solid', pt: 0.5, color: LINE }, margin: [0.04, 0.08, 0.04, 0.08], valign: 'middle' });
}

function bullets(slide: Slide, lines: string[], { x = 0.6, y = 2.0, w = 12.1, h = 4.5 } = {}) {
  slide.addText(
    lines.map((text) => ({ text, options: { bullet: { indent: 18 }, paraSpaceAfter: 10 } })),
    { x, y, w, h, fontFace: SANS, fontSize: 18, color: INK, valign: 'top' },
  );
}

// Builds the deck entirely in the browser and hands it to the person as a .pptx download.
export default async function buildDeck(facts: DeckFacts, story: DeckNarrative | null) {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = `${facts.title}: status update`;
  pptx.company = 'NØNOS';
  const logo = await logoPng(240);
  const note = (key: keyof DeckNarrative['notes'], fallback: string) => story?.notes[key]?.trim() || fallback;
  let n = 1;

  const cover = pptx.addSlide();
  cover.background = { color: 'FFFFFF' };
  cover.addImage({ data: logo.data, x: 0.6, y: 0.55, h: 0.62, w: 0.62 * logo.ratio });
  cover.addShape(pptx.ShapeType.rect, { x: 0, y: 7.38, w: 13.33, h: 0.12, fill: { color: CYAN }, line: { color: CYAN } });
  // the brand's single drawn arc, sweeping in from the right edge
  cover.addShape(pptx.ShapeType.arc, { x: 8.6, y: 2.2, w: 9.4, h: 9.4, angleRange: [180, 270], line: { color: TEAL, width: 1 } });
  cover.addText(facts.title, { x: 0.6, y: 2.5, w: 12, h: 1.3, fontFace: SANS, fontSize: 48, color: INK });
  cover.addText(facts.subtitle, { x: 0.6, y: 3.8, w: 12, h: 0.5, fontFace: SANS, fontSize: 20, color: MUTED });
  cover.addText(`PRIVATE · ${facts.period.days} DAYS · GENERATED ${facts.period.to}`, { x: 0.6, y: 6.6, w: 12, h: 0.3, fontFace: MONO, fontSize: 10, color: TEAL, charSpacing: 2 });
  cover.addNotes(note('cover', `Status update for ${facts.title}, covering the last ${facts.period.days} days.`));

  const glance = frame(pptx, ++n, 'At a glance', 'Where things stand');
  const tiles: [string, string][] = [
    ['Shipped', String(facts.counts.shipped)],
    ['In progress', String(facts.counts.active)],
    ['Open', String(facts.counts.open)],
    ['Overdue', String(facts.counts.overdue)],
  ];
  tiles.forEach(([label, value], i) => {
    const x = 0.6 + i * 3.05;
    glance.addShape(pptx.ShapeType.roundRect, { x, y: 2.0, w: 2.85, h: 1.55, rectRadius: 0.12, fill: { color: i === 0 ? CYAN : PAPER }, line: { color: i === 0 ? CYAN : LINE } });
    glance.addText(label.toUpperCase(), { x: x + 0.2, y: 2.12, w: 2.5, h: 0.3, fontFace: MONO, fontSize: 10, color: i === 0 ? INK : MUTED, charSpacing: 2 });
    glance.addText(value, { x: x + 0.2, y: 2.45, w: 2.5, h: 0.9, fontFace: SANS, fontSize: 40, color: INK });
  });
  const summary = story?.summary || `${countOf(facts.counts.shipped, 'task')} shipped in the last ${facts.period.days} days, ${facts.counts.active} in progress and ${facts.counts.overdue} overdue.`;
  glance.addText(summary, { x: 0.6, y: 3.95, w: 12.1, h: 1.2, fontFace: SANS, fontSize: 18, color: INK, valign: 'top' });
  if (story?.highlights.length) bullets(glance, story.highlights.slice(0, 4), { y: 5.05, h: 1.8 });
  glance.addNotes(note('glance', summary));

  const shipped = frame(pptx, ++n, 'Shipped', `${facts.counts.shipped} done in ${facts.period.days} days`);
  list(shipped, facts.shipped, { empty: 'Nothing was finished in this period.' });
  shipped.addNotes(note('shipped', facts.people.map((p) => `${p.name}: ${p.shipped} shipped`).join('. ') || 'No finished work in this period.'));

  const active = frame(pptx, ++n, 'In progress', 'What the team is on now');
  list(active, facts.active, { empty: 'Nothing is in progress right now.' });
  active.addNotes(note('active', `${countOf(facts.counts.active, 'task')} in progress or in review.`));

  if (facts.goals.length) {
    const goals = frame(pptx, ++n, 'Goals', 'Progress towards the goals');
    // horizontal bar charts draw the first category at the bottom, so feed them bottom-up
    const ordered = [...facts.goals].reverse();
    goals.addChart(pptx.ChartType.bar, [{ name: 'Progress', labels: ordered.map((g) => g.title), values: ordered.map((g) => g.pct) }], {
      x: 0.6, y: 1.95, w: 12.1, h: Math.min(4.9, 1.1 + 0.55 * ordered.length), barDir: 'bar', chartColors: [TEAL], valAxisMaxVal: 100, valAxisMinVal: 0, valAxisLabelFormatCode: '0"%"',
      showValue: true, dataLabelFormatCode: '0"%"', dataLabelColor: INK, dataLabelFontFace: SANS, catAxisLabelFontFace: SANS, valAxisLabelFontFace: MONO,
      catAxisLabelColor: INK, valAxisLabelColor: MUTED, valGridLine: { color: LINE, size: 0.5 }, barGapWidthPct: 60,
    });
    goals.addNotes(note('goals', facts.goals.map((g) => `${g.title}: ${g.pct}%`).join('. ')));
  }

  const risks = frame(pptx, ++n, 'Risks', facts.risks.length ? 'What could slip' : 'No open risks');
  if (story?.risks.length) {
    bullets(risks, story.risks.slice(0, 3), { h: 1.6 });
    list(risks, facts.risks.slice(0, 6), { y: 3.75 });
  } else list(risks, facts.risks, { empty: 'Nothing is overdue or marked urgent.' });
  risks.addNotes(note('risks', `${facts.counts.overdue} overdue tasks.`));

  if (facts.bounties) {
    const b = facts.bounties;
    const bounty = frame(pptx, ++n, 'Bounties', b.paid === '0' ? 'Nothing paid yet' : `${b.paid} paid on-chain`);
    const header = ['Person', 'Paid', 'Owed'].map((text) => ({ text, options: { fontFace: MONO, fontSize: 10, color: MUTED, bold: false } }));
    const rows = b.rows.map((r) => [
      { text: r.name, options: { fontFace: SANS, fontSize: 14, color: INK } },
      { text: r.paid, options: { fontFace: MONO, fontSize: 13, color: INK, align: 'right' as const } },
      { text: r.owed, options: { fontFace: MONO, fontSize: 13, color: INK, align: 'right' as const } },
    ]);
    bounty.addTable([header, ...rows], { x: 0.6, y: 2.0, w: 12.1, colW: [6.1, 3, 3], rowH: 0.4, border: { type: 'solid', pt: 0.5, color: LINE }, margin: [0.05, 0.1, 0.05, 0.1] });
    bounty.addNotes(note('bounties', `Bounties are paid wallet to wallet and checked on-chain. Owed for finished work: ${b.owed}.`));
  }

  const next = frame(pptx, ++n, 'Next', 'Next steps');
  if (story?.nextSteps.length) bullets(next, story.nextSteps.slice(0, 6));
  else list(next, facts.nextUp, { empty: 'The backlog is clear.' });
  next.addNotes(note('next', 'Highest-priority open work, in order.'));

  const slug = facts.title.toLowerCase().replace(/ø/g, 'o').normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'status';
  await pptx.writeFile({ fileName: `${slug}-status-${facts.period.to}.pptx` });
}
