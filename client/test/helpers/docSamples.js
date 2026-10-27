// Doc content for the converter tests, written the way the editor stores it.

// a red 1×1 PNG, and a blue 2×1 one so two images differ
export const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64'));
export const PNG_WIDE = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR4nGNgYPj/H4QBDfsD/Yde1YcAAAAASUVORK5CYII=', 'base64'));

const mark = (m) => (typeof m === 'string' ? { type: m } : m);
export const link = (href) => ({ type: 'link', attrs: { href } });
export const text = (value, ...marks) => ({ type: 'text', text: value, ...(marks.length && { marks: marks.map(mark) }) });
export const para = (...content) => ({ type: 'paragraph', ...(content.length && { content }) });
export const heading = (level, ...content) => ({ type: 'heading', attrs: { level }, content });
export const item = (...content) => ({ type: 'listItem', content });
export const task = (checked, ...content) => ({ type: 'taskItem', attrs: { checked }, content });
export const cell = (type, ...content) => ({ type, content });
export const doc = (...content) => ({ type: 'doc', content });
export const image = (blob, extra = {}) => ({ type: 'sealedImage', attrs: { blob, key: `key-${blob}`, mime: 'image/png', name: `${blob}.png`, width: null, height: null, alt: `Alt ${blob}`, ...extra } });

// Every node and mark a doc can hold that both Markdown and Word carry over unchanged.
export const faithful = () =>
  doc(
    heading(1, text('Quarterly plan')),
    heading(2, text('Goals')),
    heading(3, text('Details')),
    para(text('Plain, '), text('bold', 'bold'), text(', '), text('italic', 'italic'), text(', '), text('underlined', 'underline'), text(', '), text('struck', 'strike'), text(', '), text('code()', 'code'), text(', '), text('highlighted', 'highlight'), text(' and a '), text('link', link('https://nil.example/docs?a=1&b=2')), text('.')),
    para(text('Both at once', 'bold', 'italic'), text(' then a mail '), text('link', link('mailto:team@nil.example')), text(' and '), text('bold link', 'bold', link('https://nil.example/'))),
    para(text('First line'), { type: 'hardBreak' }, text('second line')),
    { type: 'bulletList', content: [item(para(text('One')), { type: 'bulletList', content: [item(para(text('One a'))), item(para(text('One b')))] }), item(para(text('Two')))] },
    { type: 'orderedList', attrs: { start: 1 }, content: [item(para(text('First'))), item(para(text('Second')), { type: 'orderedList', attrs: { start: 1 }, content: [item(para(text('Second a')))] })] },
    { type: 'taskList', content: [task(false, para(text('Write the brief'))), task(true, para(text('Book the room')), { type: 'taskList', content: [task(true, para(text('Confirm with facilities')))] })] },
    { type: 'table', content: [{ type: 'tableRow', content: [cell('tableHeader', para(text('Owner'))), cell('tableHeader', para(text('Status')))] }, { type: 'tableRow', content: [cell('tableCell', para(text('Ann'))), cell('tableCell', para(text('Done', 'bold')))] }] },
    { type: 'codeBlock', attrs: { language: null }, content: [text('const total = items\n  .map((i) => i.cost)\n\n  .reduce((a, b) => a + b, 0);')] },
    { type: 'blockquote', content: [para(text('Ship small, ship often.'))] },
    { type: 'horizontalRule' },
    para(text('The end.')),
  );
