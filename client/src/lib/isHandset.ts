// Phones, where the wallet app sits on the same screen that shows Nil, so a code to scan from it
// is no use. Tablets don't count: an iPad without a wallet can show the code to the phone beside
// it. Android tablets leave "Mobile" out of their user agent, and iPads call themselves iPads or
// Macs, so neither matches.
export default function isHandset() {
  const hints = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (hints?.mobile) return true;
  return /iPhone|iPod|Android.*Mobile/.test(navigator.userAgent);
}
