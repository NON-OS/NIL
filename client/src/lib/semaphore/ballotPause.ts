// A random pause of two to ten seconds before an anonymous ballot goes out, so it doesn't arrive
// in step with the fetch just before it, or with anything this browser sends signed in.
export default function ballotPause() {
  const ms = 2000 + (crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * 8000;
  return new Promise((resolve) => setTimeout(resolve, ms));
}
