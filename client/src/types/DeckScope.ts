export default interface DeckScope {
  kind: 'workspace' | 'project' | 'goal';
  id?: string;
  days: 7 | 14 | 30;
  includePrivate: boolean;
}
