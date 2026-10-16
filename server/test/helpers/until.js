// Polls `check` until it returns something truthy, or fails after `timeoutMs`.
export default async function until(check, { timeoutMs = 5000, every = 20, what = 'the condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}.`);
    await new Promise((resolve) => setTimeout(resolve, every));
  }
}
