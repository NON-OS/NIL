// The three browser engines the calls check runs in, each with fake cameras and microphones
// that need no person to allow them, where the engine has any. Chromium is the one this machine
// has; Firefox and WebKit come from PLAYWRIGHT_BROWSERS_PATH when it points at a folder holding
// them (npx playwright-core install firefox webkit), so the preinstalled Chromium is never
// touched. Playwright's WebKit on Linux can't be given a camera or microphone, not even a mock
// one, so its people join without them and the check leaves out what needs a picture or sound.
import { chromium, firefox, webkit } from 'playwright-core';

const engines = {
  chromium: () =>
    chromium.launch({
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--auto-accept-this-tab-capture', '--auto-select-desktop-capture-source=Entire screen'],
    }),
  firefox: () =>
    firefox.launch({
      firefoxUserPrefs: {
        'media.navigator.streams.fake': true,
        'media.navigator.permission.disabled': true,
        // Firefox leaves out host candidates for loopback and private networks by default
        'media.peerconnection.ice.loopback': true,
      },
    }),
  webkit: () => webkit.launch(),
};

// Context options a browser accepts: Firefox has no phone emulation and grants cameras through
// the preferences above; WebKit has no camera permission at all.
function contextOptions(name, size) {
  const { isMobile, ...rest } = size;
  if (name === 'firefox') return rest;
  if (name === 'webkit') return size;
  return { ...size, permissions: ['camera', 'microphone'] };
}

export default { names: Object.keys(engines), launch: (name) => engines[name](), contextOptions, capture: (name) => name !== 'webkit' };
