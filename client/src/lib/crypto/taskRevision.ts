// The revision a sealed piece of a private task carries next to its author's signature. Every
// save seals all of a task's words again under the next number, and the signature covers it (see
// taskText.context), so a server can't pass an old version off as new. It can only send an old
// one, which then shows as older than what this browser has opened. Pieces sealed before
// revisions existed carry none and count as 0.
const LIMIT = 2 ** 31;

const taskRevision = {
  add: (signedJson: string, rev: number) => JSON.stringify({ ...JSON.parse(signedJson), rev }),

  of(json: string): number {
    const value = JSON.parse(json) as { rev?: unknown };
    const rev = 'rev' in value ? value.rev : 0;
    if (typeof rev !== 'number' || !Number.isSafeInteger(rev) || rev < 0 || rev >= LIMIT) throw new Error('This private task carries a revision number Nil doesn’t accept.');
    return rev;
  },
};

export default taskRevision;
