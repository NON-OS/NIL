import express from 'express';
import path from 'node:path';

// Serves the built web app from `dist`: hashed assets cached for a year, the service worker
// never, and the app's HTML for any other path so client-side routes work on reload.
export default function serveWebApp(app, dist) {
  // the service worker must always be fresh, or a stale one could pin an old app forever
  app.get('/sw.js', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(dist, 'sw.js'));
  });
  app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y', index: false }));
  // A missing asset is a plain 404, never the app's HTML. A tab still running the previous
  // release asks for files that are gone, and HTML in place of a script fails in confusing ways.
  app.use('/assets', (req, res) => res.status(404).set('Cache-Control', 'no-store').type('text').send('Not found'));
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(dist, 'index.html'));
  });
}
