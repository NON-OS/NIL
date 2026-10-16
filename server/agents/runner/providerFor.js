import anthropicProvider from './anthropicProvider.js';
import openaiProvider from './openaiProvider.js';

const FACTORIES = { anthropic: anthropicProvider, openai: openaiProvider };
let replacement = null;

// The model behind an agent's runs. Tests swap in a scripted model with `replace`, so the whole
// runner can be exercised without a network or an API key.
const providerFor = {
  get(agent) {
    if (replacement) return replacement(agent);
    const factory = FACTORIES[agent.runner];
    if (!factory) throw new Error(`No built-in runner called ${agent.runner}.`);
    return factory(agent);
  },

  replace(factory) {
    replacement = factory;
  },
};

export default providerFor;
