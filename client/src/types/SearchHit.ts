import type Status from './Status';

// One search result: a task (team or private) or a doc, with the field that matched and a
// short excerpt of it. Team task hits come from the server; private ones and docs from this tab.
export default interface SearchHit {
  kind: 'task' | 'doc';
  id: string;
  // tasks only
  number?: number;
  status?: Status;
  title: string;
  field: 'title' | 'description' | 'checklist' | 'comment' | 'body';
  snippet: string;
}
