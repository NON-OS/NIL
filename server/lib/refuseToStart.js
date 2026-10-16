// For the few settings the server can't run safely without. Stopping at startup with the reason
// beats starting in a state where sign-in or privacy quietly depends on a guess.
export default function refuseToStart(message) {
  console.error(`[config] ${message}`);
  process.exit(1);
}
