import launch from './launch.mjs';

// Runs some work with a browser of its own and closes it after. Each stage of the demo gets a
// fresh one: a single Chromium kept through the seed and every screenshot has crashed partway.
export default async function withBrowser(work) {
  const browser = await launch();
  try {
    return await work(browser);
  } finally {
    await browser.close().catch(() => {});
  }
}
