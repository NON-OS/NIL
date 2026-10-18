import factChecks from './factChecks';

export interface CommentFacts {
  // 0 when the comment is written, one more with each edit
  edit: number;
  at: number;
}

// What a comment on a private task is signed with, from format 2 on. Its place is the task, the
// comment's own id and its author, so the server can't move it to another task, show it as
// another comment or under someone else's name. The edit number lets a browser that has seen an
// edit tell when the server shows an older one.
const commentFacts = {
  kind: 'nil/task-comment/v2',
  place: (taskId: string, commentId: string, authorId: string | null) => [taskId, commentId, authorId],
  list: (f: CommentFacts) => [f.edit, f.at],

  parse(list: unknown[]): CommentFacts {
    const [edit, at] = list;
    if (list.length !== 2 || !factChecks.count(edit, 2 ** 31) || !factChecks.time(at)) throw new Error('This comment carries details Nil doesn’t accept.');
    return { edit: edit as number, at: at as number };
  },
};

export default commentFacts;
