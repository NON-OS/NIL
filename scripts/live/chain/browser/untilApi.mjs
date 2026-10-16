// Asks the app's API from a signed-in page until `check` likes the answer.
export default async function untilApi(person, url, check, { timeoutMs = 60_000, what = url } = {}) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const answer = await person.api('GET', url);
    if (check(answer)) return answer;
    if (Date.now() > until) throw new Error(`Timed out waiting for ${what}: ${JSON.stringify(answer).slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
}
