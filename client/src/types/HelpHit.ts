import type HelpTopic from './HelpTopic';

export default interface HelpHit {
  topic: HelpTopic;
  // the words around the first match in the text, or null when only the title matched
  snippet: { before: string; match: string; after: string } | null;
}
