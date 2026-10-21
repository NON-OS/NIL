// What a stand-in model answers each built-in AI feature with, picked from the prompt: JSON for the
// features that ask for it, a line of text for the rest.
export default function aiAnswer(prompt) {
  const text = String(prompt ?? '');
  if (/checklist steps/.test(text)) return JSON.stringify({ steps: ['Write the outline', 'Ship it'] });
  if (/actionable task/.test(text)) return JSON.stringify({ tasks: [{ title: 'Book the venue', description: '', priority: 'high', dueDate: null, assignee: null }] });
  if (/status presentation/.test(text)) return JSON.stringify({ summary: 'Two tasks shipped.', highlights: ['NON-1 shipped'], risks: [], nextSteps: [], notes: {} });
  return 'Drafted.';
}
