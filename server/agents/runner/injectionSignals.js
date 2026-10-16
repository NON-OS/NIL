// Phrases that read like someone trying to steer an agent through task text rather than describe
// work. Finding one changes nothing on its own: the server enforces scope and approvals whatever
// the model does. It's noted in the run log and pointed out to the model as content to distrust.
const PATTERNS = [
  /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|your|system)\b[^.\n]{0,20}\b(instructions?|rules?|prompts?|guidelines)\b/i,
  /\b(reveal|print|show|repeat|output|leak|send)\b[^.\n]{0,40}\b(system prompt|instructions|api[ -]?keys?|tokens?|secrets?|passwords?|credentials?)\b/i,
  /\byou are (now|no longer)\b/i,
  /\b(change|expand|increase|grant|give)\b[^.\n]{0,30}\b(your|yourself)\b[^.\n]{0,30}\b(scope|permissions?|access|privileges?|role)\b/i,
  /\b(new|updated) (system )?instructions\b/i,
  /<\/?(system|admin_instructions|instructions)>/i,
];

export default function injectionSignals(...texts) {
  return texts.some((text) => PATTERNS.some((pattern) => pattern.test(String(text ?? ''))));
}
