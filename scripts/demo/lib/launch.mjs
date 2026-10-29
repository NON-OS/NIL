import { chromium } from 'playwright-core';

// The demo server is on this machine, so a proxy set for the outside world mustn't stand in between.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/_proxy$/i.test(k)));

// Chromium from PLAYWRIGHT_BROWSERS_PATH, or CHROMIUM_PATH when it is set, like the other
// browser checks in scripts/.
export default function launch() {
  return chromium.launch({ env, executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-proxy-server'] });
}
