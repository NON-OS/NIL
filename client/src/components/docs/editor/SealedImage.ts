import { Node, mergeAttributes } from '@tiptap/core';

// An image in a doc. Its bytes are an encrypted blob on the server; the key to it lives here,
// inside the doc, so whoever can read the doc can see the image and the server can't. Nothing in
// the node points at a URL, so a doc can't be made to load images from anywhere else.
const SealedImage = Node.create({
  name: 'sealedImage',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      blob: { default: null },
      key: { default: null },
      mime: { default: null },
      name: { default: null },
      width: { default: null },
      height: { default: null },
      alt: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-sealed-image]', getAttrs: (el) => ({ blob: el.getAttribute('data-blob'), key: el.getAttribute('data-key'), mime: el.getAttribute('data-mime'), name: el.getAttribute('data-name'), alt: el.getAttribute('data-alt') ?? '' }) }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { blob, key, mime, name, alt } = node.attrs;
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-sealed-image': '', 'data-blob': blob, 'data-key': key, 'data-mime': mime, 'data-name': name, 'data-alt': alt }), alt || name || ''];
  },
});

export default SealedImage;
