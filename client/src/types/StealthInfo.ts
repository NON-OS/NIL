export default interface StealthInfo {
  announcer: string;
  gasTopUpWei: string;
  // the ERC-6538 registry, or null when this server leaves it out
  registry: string | null;
}
