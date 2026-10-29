import DOMPurify, { type Config } from 'dompurify';
import { DOMParser as SchemaParser, type TagParseRule } from '@tiptap/pm/model';
import type { JSONContent } from '@tiptap/core';
import docSchema from './docSchema';
import checkboxLists from './checkboxLists';
import type SealedImageAttrs from './SealedImageAttrs';

// Only the elements the style map makes, only the attributes it sets, and links to web and mail
// addresses. Everything else in the HTML is dropped before anything parses it; an <img> never
// keeps a src, since the browser would fetch it even before the image is placed anywhere.
const PURIFY: Config & { RETURN_DOM_FRAGMENT: true } = {
  ALLOWED_TAGS: ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'strike', 'mark', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'br', 'hr', 'img'],
  ALLOWED_ATTR: ['href', 'colspan', 'rowspan', 'data-image', 'data-align', 'data-title'],
  ALLOW_DATA_ATTR: false,
  ALLOWED_URI_REGEXP: /^(?:https?:\/\/|mailto:)/i,
  // values DOMPurify would otherwise hold to the link rule above
  ADD_URI_SAFE_ATTR: ['colspan', 'rowspan', 'data-image', 'data-align', 'data-title'],
  RETURN_DOM_FRAGMENT: true,
};
const ALIGNS = new Set(['center', 'right', 'justify']);

// The doc's title is Word's Title paragraph, when the document opens with one.
function takeTitle(root: DocumentFragment) {
  for (const el of Array.from(root.children)) {
    if (el.hasAttribute('data-title')) {
      el.remove();
      return el.textContent?.replace(/\s+/g, ' ').trim() || null;
    }
    if (el.textContent?.trim() || el.querySelector('img')) return null;
  }
  return null;
}

// Word keeps an image in a paragraph, where a doc has it as a block of its own. A paragraph
// holding only images gives way to them, rather than leaving an empty one behind.
function liftImages(root: DocumentFragment) {
  for (const p of Array.from(root.querySelectorAll('p'))) {
    const images = p.querySelectorAll('img[data-image]');
    if (images.length && !p.textContent?.trim()) p.replaceWith(...Array.from(images));
  }
}

// The image onImage stored under the index the Word reader left on an <img>.
function imageAttrs(index: string | null, images: SealedImageAttrs[]) {
  const attrs = index && /^\d{1,6}$/.test(index) ? images[Number(index)] : undefined;
  if (!attrs) return false;
  const { blob, key, mime, name, width, height, alt } = attrs;
  return { blob, key, mime, name, width, height, alt };
}

// Turns the HTML mammoth made of a Word file into doc content: sanitised, then parsed with the
// editor's own schema, so anything it has no node or mark for falls away.
export default function parseDocxHtml(html: string, images: SealedImageAttrs[]): { title: string | null; content: JSONContent } {
  // without a DOM to work in DOMPurify hands the input back untouched
  if (!DOMPurify.isSupported) throw new Error('This browser can’t import Word files safely.');
  const root = DOMPurify.sanitize(html, PURIFY);
  const title = takeTitle(root);
  liftImages(root);
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-align]'))) {
    const align = el.getAttribute('data-align') ?? '';
    if (ALIGNS.has(align)) el.style.textAlign = align;
  }
  const schema = docSchema();
  const image: TagParseRule = { tag: 'img[data-image]', node: 'sealedImage', getAttrs: (el) => imageAttrs(el.getAttribute('data-image'), images) };
  const doc = new SchemaParser(schema, [image, ...SchemaParser.fromSchema(schema).rules]).parse(root);
  const content = schema.nodeFromJSON(checkboxLists(doc.toJSON()));
  content.check();
  return { title, content: content.toJSON() };
}
