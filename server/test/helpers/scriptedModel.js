// A stand-in for a model provider that plays back scripted turns, so the runner can be tested
// with no network and no API key. Each turn is an object or a function of (state, signal) that
// returns { text, calls: [{ name, input }], usage, stop }. Everything the runner hands the model
// is kept in `seen` for assertions.
export default function scriptedModel(turns = []) {
  const seen = [];
  const factory = (agent) => ({
    model: 'scripted-model',
    start({ system, user, tools }) {
      const state = { agent: agent.name, system, user, tools: tools.map((t) => t.name), results: [], step: 0 };
      seen.push(state);
      return state;
    },
    async step(state, { signal }) {
      const next = turns[Math.min(state.step, turns.length - 1)];
      state.step += 1;
      const turn = (typeof next === 'function' ? await next(state, signal) : next) ?? { text: 'Done.' };
      const calls = (turn.calls ?? []).map((call, i) => ({ id: `call_${state.step}_${i}`, ...call }));
      return { text: turn.text ?? '', calls, usage: turn.usage ?? { input: 100, output: 20 }, stop: turn.stop ?? (calls.length ? 'tool_use' : 'end') };
    },
    addResults(state, results) {
      state.results.push(...results);
    },
  });
  return { factory, seen };
}
