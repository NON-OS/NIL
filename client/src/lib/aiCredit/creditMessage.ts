import fieldOf from './fieldOf';

// What the proof signs: the feature and the exact request text, so it can't be reused for
// a different prompt.
export default function creditMessage(feature: string, payload: string) {
  return fieldOf(`nil/ai-credit/v1|message|${feature}|${payload}`);
}
