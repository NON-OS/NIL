import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SIZE = { width: 1280, height: 720 };

// Records a page's animation for a few seconds as a WebM, with Playwright's own video capture.
export default async function record(browser, html, file, ms) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nil-demo-video-'));
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir, size: SIZE } });
  const page = await context.newPage();
  await page.setContent(html);
  await page.waitForTimeout(ms);
  await context.close();
  await page.video().saveAs(file);
  fs.rmSync(dir, { recursive: true, force: true });
}
