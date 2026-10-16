// Phones and tablets, where a wallet is an app rather than a browser extension. iPads ask for
// desktop sites and call themselves Macs, so a touch screen gives them away.
export default function isPhone() {
  const hints = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (hints?.mobile) return true;
  const ua = navigator.userAgent;
  return /Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
