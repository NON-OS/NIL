// Keeps finalizing blocks while the browser waits for something that needs a final block, the
// way mainnet would make it final in its own time. Returns what `waiting` resolves to.
export default async function mineWhile(chain, waiting, every = 2000) {
  let done = false;
  const result = waiting.finally(() => {
    done = true;
  });
  while (!done) {
    await chain.finalize();
    await Promise.race([result.catch(() => {}), new Promise((r) => setTimeout(r, every))]);
  }
  return result;
}
