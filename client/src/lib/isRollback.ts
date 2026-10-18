// Whether the revisions a private task opened with mean the server is holding back newer words:
// its pieces disagree, so an old piece was mixed in with new ones, or the task is older than the
// newest revision this browser has already opened.
export default function isRollback(revs: number[], seen: number) {
  return revs.some((rev) => rev !== revs[0]) || revs[0] < seen;
}
