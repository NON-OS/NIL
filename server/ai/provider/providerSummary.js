import config from '../../config.js';
import aiProvider from './aiProvider.js';
import providerName from './providerName.js';

// Who built-in AI sends text to, for the disclosure every member sees: the provider's name, the
// model, and whose key it is. Null while AI is off. Nothing secret.
export default function providerSummary() {
  const row = aiProvider.row();
  if (row && config.agents.outbound) return { name: providerName(row.kind, row.base_url), kind: row.kind, model: row.model, source: 'workspace' };
  if (config.ai.enabled) return { name: providerName('anthropic'), kind: 'anthropic', model: config.ai.model, source: 'server' };
  return null;
}
