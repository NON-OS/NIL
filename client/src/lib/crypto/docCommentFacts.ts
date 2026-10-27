export interface DocCommentFacts {
  at: number;
  // the words the thread is about, on its first message; empty on replies
  quote: string;
}

// What a message in a doc's comment thread is signed with. Its place is the doc, the thread and
// the message's own id, so another reader can't move it to another thread or doc, and the first
// message carries the words the thread is about, so nobody can point the thread at other words
// under its author's name.
const docCommentFacts = {
  kind: 'nil/doc-comment/v1',
  place: (docId: string, threadId: string, messageId: string) => [docId, 'comment', threadId, messageId],
  list: (f: DocCommentFacts) => [f.at, f.quote],
};

export default docCommentFacts;
