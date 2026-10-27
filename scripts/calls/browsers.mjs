// The three browser engines the calls check runs in, each with fake cameras and microphones
// that need no person to allow them, where the engine has any. Chromium is the one this machine
// has; Firefox and WebKit come from PLAYWRIGHT_BROWSERS_PATH when it points at a folder holding
// them (npx playwright-core install firefox webkit), so the preinstalled Chromium is never
// touched. Playwright's WebKit on Linux can't be given a camera or microphone, not even a mock
// one, so there its people join without them and the check leaves out what needs a picture or
// sound. On macOS WebKit has mock devices, and the CI job there runs the whole check, SFU too.
const macWebKit = process.platform === 'darwin';
import { chromium, firefox, webkit } from 'playwright-core';

// The check's servers are all on this machine; a proxy set for the outside world mustn't stand in between.
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/_proxy$/i.test(k)));

const engines = {
  chromium: () =>
    chromium.launch({
      env,
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ['--no-proxy-server', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--auto-accept-this-tab-capture', '--auto-select-desktop-capture-source=Entire screen'],
    }),
  firefox: () =>
    firefox.launch({
      env,
      firefoxUserPrefs: {
        'network.proxy.type': 0,
        'media.navigator.streams.fake': true,
        'media.navigator.permission.disabled': true,
        // Firefox leaves out host candidates for loopback and private networks by default
        'media.peerconnection.ice.loopback': true,
      },
    }),
  webkit: () => webkit.launch({ env }),
};

// Context options a browser accepts: Firefox has no phone emulation and grants cameras through
// the preferences above; WebKit has no camera permission at all.
function contextOptions(name, size) {
  const { isMobile, ...rest } = size;
  if (name === 'firefox') return rest;
  if (name === 'webkit') return macWebKit ? { ...size, permissions: ['camera', 'microphone'] } : size;
  return { ...size, permissions: ['camera', 'microphone'] };
}

export default { names: Object.keys(engines), launch: (name) => engines[name](), contextOptions, capture: (name) => name !== 'webkit' || macWebKit };
