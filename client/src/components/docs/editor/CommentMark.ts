import { Mark, mergeAttributes } from '@tiptap/core';

// Marks the text a comment thread is about. The thread itself lives in the doc's shared state
// (see docComments), so it's encrypted and synced with the text.
const CommentMark = Mark.create({
  name: 'comment',
  inclusive: false,
  excludes: '',

  addAttributes() {
    return { thread: { default: null } };
  },

  parseHTML() {
    return [{ tag: 'span[data-comment]', getAttrs: (el) => ({ thread: el.getAttribute('data-comment') }) }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-comment': HTMLAttributes.thread, class: 'doc-comment-mark' }), 0];
  },
});

export default CommentMark;
