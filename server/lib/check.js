import HttpError from './HttpError.js';
import sql from '../db/sql.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ZONE = /^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const TABLES = new Set(['users', 'projects', 'goals', 'labels', 'tasks']);

const fail = (message) => {
  throw HttpError.badRequest(message);
};

// Input validation. Every value from a request goes through one of these.
const check = {
  text(value, field, { min = 0, max = 500 } = {}) {
    if (value === undefined || value === null) value = '';
    if (typeof value !== 'string') fail(`${field} must be text.`);
    const s = value.trim();
    if (s.length < min) fail(min === 1 ? `${field} can’t be empty.` : `${field} needs at least ${min} characters.`);
    if (s.length > max) fail(`${field} can be at most ${max} characters.`);
    return s;
  },

  date(value, field) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || !DATE.test(value) || Number.isNaN(Date.parse(value))) fail(`${field} must be a date like 2026-03-31.`);
    return value;
  },

  // a wall-clock time like 15:30, or null
  time(value, field) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || !TIME.test(value)) fail(`${field} must be a time like 15:30.`);
    return value;
  },

  // an IANA time zone name the server knows, like Europe/Stockholm
  timeZone(value) {
    if (typeof value !== 'string' || !ZONE.test(value)) fail('Time zone isn’t valid.');
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
    } catch {
      fail('Time zone isn’t valid.');
    }
  },

  number(value, field, { min = -1e12, max = 1e12, integer = false } = {}) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) fail(`${field} must be a number.`);
    return n;
  },

  ref(table, value, field) {
    if (value === undefined || value === null || value === '') return null;
    if (!TABLES.has(table)) throw new Error(`check.ref: unknown table ${table}`);
    if (typeof value !== 'string' || !sql.get(`SELECT 1 FROM ${table} WHERE id = ?`, value)) fail(`${field} doesn’t exist anymore.`);
    return value;
  },

  oneOf(value, allowed, field) {
    if (!allowed.includes(value)) fail(`${field} isn’t valid.`);
    return value;
  },

  color(value) {
    if (typeof value !== 'string' || !COLOR.test(value)) fail('Pick one of the colors.');
    return value.toLowerCase();
  },

  // Token amounts travel as whole numbers of the smallest unit (wei) written as text,
  // because 18-decimal values don't fit in a JavaScript number.
  amount(value, field) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' || !/^\d{1,40}$/.test(value) || BigInt(value) === 0n) fail(`${field} must be a positive token amount.`);
    return BigInt(value).toString();
  },

  isColor: (value) => typeof value === 'string' && COLOR.test(value),
};

export default check;
