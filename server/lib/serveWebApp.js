import express from 'express';
import path from 'node:path';
import compressStatic from './compressStatic.js';

// Hashed assets never change under their name; the rest of the build may change on a deploy.
const ASSETS_CACHE = 'public, max-age=31536000, immutable';
const FILES_CACHE = 'public, max-age=3600';

const cacheFor = (value) => ({ index: false, cacheControl: false, setHeaders: (res) => res.setHeader('Cache-Control', value) });

// Serves the built web app from `dist`: hashed assets cached for a year, the service worker
// never, and the app's HTML for any other path so client-side routes work on reload. Scripts,
// styles and circuit files go out compressed to browsers that accept it.
export default function serveWebApp(app, dist) {
  // the service worker must always be fresh, or a stale one could pin an old app forever
  app.get('/sw.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(dist, 'sw.js'));
  });
  app.use('/assets', compressStatic(path.join(dist, 'assets'), ASSETS_CACHE));
  app.use('/assets', express.static(path.join(dist, 'assets'), cacheFor(ASSETS_CACHE)));
  // A missing asset is a plain 404, never the app's HTML. A tab still running the previous
  // release asks for files that are gone, and HTML in place of a script fails in confusing ways.
  app.use('/assets', (req, res) => res.status(404).set('Cache-Control', 'no-store').type('text').send('Not found'));
  app.use(compressStatic(dist, FILES_CACHE));
  app.use(express.static(dist, cacheFor(FILES_CACHE)));
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(dist, 'index.html'));
  });
}
