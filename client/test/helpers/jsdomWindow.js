import { JSDOM } from 'jsdom';

// A real DOM for the code that sanitises and parses HTML, as a browser would give it. DOMPurify
// supports jsdom (and only jsdom) outside a browser, and attaches to the window it finds when it
// first loads, so import this before anything that imports it.
const { window } = new JSDOM('<!doctype html><html><head></head><body></body></html>');
globalThis.window = window;
globalThis.document = window.document;
