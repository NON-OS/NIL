import openChat from '../lib/openChat.mjs';
import conversations from './conversations.mjs';

const link = (page, name) => page.locator('.chat-link', { hasText: name }).first();

async function newChannel(page, name, topic) {
  const start = page.getByRole('button', { name: 'Start a channel' });
  if (await start.isVisible().catch(() => false)) await start.click();
  else await page.getByRole('button', { name: 'New conversation' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Topic (optional)').fill(topic);
  await page.getByRole('button', { name: 'Create channel' }).click();
  await page.locator('.chat-composer textarea').waitFor();
}

// Opens a channel and waits until this browser holds its key, which is when the box takes text.
async function enter(page, name) {
  await link(page, name).waitFor({ timeout: 30000 });
  await link(page, name).click();
  await page.locator('.chat-composer textarea').first().waitFor();
  await page.waitForFunction(() => !document.querySelector('.chat-composer textarea')?.disabled, null, { timeout: 30000 });
}

async function say(page, name, text) {
  await enter(page, name);
  await page.locator('.chat-composer textarea').first().fill(text);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(900);
}

// What a channel already says, as Ada reads it.
async function said(page, name) {
  await enter(page, name);
  await page.waitForTimeout(2000);
  return page.locator('.msg').allInnerTexts();
}

// The part of a line to look for: mentions show as names, so only what comes before one.
const gist = (text) => text.split('@')[0].trim();

// Three channels with their conversations. The order matters: a channel's key reaches the others
// only when its maker's browser seals it to them, so everyone opens Chat, each maker opens their
// channel, and everyone opens Chat again before anyone writes. Channels and lines already there
// are skipped, so a rerun neither doubles them nor shuffles the order.
export default async function chat(pages, base) {
  const everyone = Object.values(pages);
  for (const page of everyone) await openChat(page, base);
  for (const { maker, name, topic } of conversations) {
    if (!(await link(pages[maker], name).count())) await newChannel(pages[maker], name, topic);
  }
  for (const page of everyone) await openChat(page, base);
  for (const { maker, name } of conversations) {
    await enter(pages[maker], name);
    await pages[maker].waitForTimeout(4000);
  }
  for (const page of everyone) await openChat(page, base);
  for (const { name, lines } of conversations) {
    const there = await said(pages.ada, name);
    for (const [who, text] of lines) if (!there.some((t) => t.includes(gist(text)))) await say(pages[who], name, text);
  }
}
