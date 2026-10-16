import HttpError from '../lib/HttpError.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const fail = (path, message) => {
  throw HttpError.badRequest(`${path ? `${path}: ` : ''}${message}`);
};

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function check(schema, value, path) {
  const actual = typeOf(value);
  const fits = schema.type === actual || (schema.type === 'number' && actual === 'integer');
  if (schema.type && !fits) fail(path, `expected ${schema.type}, got ${actual}.`);
  if (schema.enum && !schema.enum.includes(value)) fail(path, `must be one of ${schema.enum.join(', ')}.`);
  if (actual === 'string') {
    if (schema.minLength !== undefined && value.trim().length < schema.minLength) fail(path, 'can’t be empty.');
    if (schema.maxLength !== undefined && value.length > schema.maxLength) fail(path, `can be at most ${schema.maxLength} characters.`);
    if (schema.format === 'date' && (!DATE.test(value) || Number.isNaN(Date.parse(value)))) fail(path, 'must be a date like 2026-03-31.');
  }
  if (actual === 'integer' || actual === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) fail(path, `must be at least ${schema.minimum}.`);
    if (schema.maximum !== undefined && value > schema.maximum) fail(path, `must be at most ${schema.maximum}.`);
  }
  if (actual === 'array') {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail(path, `can hold at most ${schema.maxItems} items.`);
    if (schema.items) value.forEach((item, i) => check(schema.items, item, `${path}[${i}]`));
  }
  if (actual === 'object' && schema.properties) {
    for (const key of schema.required ?? []) if (value[key] === undefined) fail(path, `${key} is required.`);
    for (const [key, item] of Object.entries(value)) {
      const sub = schema.properties[key];
      if (!sub) {
        if (schema.additionalProperties === false) fail(path, `unknown field “${key}”.`);
        continue;
      }
      if (item !== undefined) check(sub, item, path ? `${path}.${key}` : key);
    }
  }
}

// Checks tool arguments against the tool's JSON Schema before anything runs. Tool calls come
// from models and outside programs, so nothing is trusted to match the shape it was given.
// Covers the subset of JSON Schema the tool definitions use.
export default function validateArgs(schema, args) {
  const value = args ?? {};
  if (typeOf(value) !== 'object') fail('', 'arguments must be an object.');
  check(schema, value, '');
  return value;
}
