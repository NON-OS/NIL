import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import isHandset from '../src/lib/isHandset.ts';

const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const as = (userAgent: string, extra: Record<string, unknown> = {}) =>
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent, maxTouchPoints: 0, ...extra }, configurable: true });
afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'navigator', original);
});

test('phones are handsets', () => {
  as('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1');
  assert.equal(isHandset(), true);
  as('Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36');
  assert.equal(isHandset(), true);
  as('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', { userAgentData: { mobile: true } });
  assert.equal(isHandset(), true);
});

test('tablets and computers are not, so they can show a code to the phone', () => {
  as('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15', { maxTouchPoints: 5 });
  assert.equal(isHandset(), false);
  as('Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1');
  assert.equal(isHandset(), false);
  as('Mozilla/5.0 (Linux; Android 15; SM-X910) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', { userAgentData: { mobile: false } });
  assert.equal(isHandset(), false);
  as('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36');
  assert.equal(isHandset(), false);
});
