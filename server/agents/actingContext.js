import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

// Who an agent is acting for while one of its tool calls runs. The services that write history
// (logActivity) read it from here, so the same task and comment code serves people and agents
// without passing the context through every call.
const actingContext = {
  run: (context, fn) => storage.run(context, fn),
  current: () => storage.getStore() ?? null,
};

export default actingContext;
