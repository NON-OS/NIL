import { Node, mergeAttributes } from '@tiptap/core';

// A file attached inside a doc, such as a PDF or a Word file: an encrypted blob whose key lives
// in the doc, shown as a chip that previews or downloads it.
const SealedFile = Node.create({
  name: 'sealedFile',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      blob: { default: null },
      key: { default: null },
      mime: { default: null },
      name: { default: null },
      size: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-sealed-file]', getAttrs: (el) => ({ blob: el.getAttribute('data-blob'), key: el.getAttribute('data-key'), mime: el.getAttribute('data-mime'), name: el.getAttribute('data-name'), size: Number(el.getAttribute('data-size')) || null }) }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { blob, key, mime, name, size } = node.attrs;
    return ['div', mergeAttributes(HTMLAttributes, { 'data-sealed-file': '', 'data-blob': blob, 'data-key': key, 'data-mime': mime, 'data-name': name, 'data-size': size }), name || 'File'];
  },
});

export default SealedFile;
