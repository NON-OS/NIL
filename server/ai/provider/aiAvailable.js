import config from '../../config.js';
import aiProvider from './aiProvider.js';

// Whether built-in AI is on for this workspace: it has a provider of its own (and a route out to
// reach it), or the server has a default. Reads no key.
export default function aiAvailable() {
  return Boolean((aiProvider.row() && config.agents.outbound) || config.ai.enabled);
}
