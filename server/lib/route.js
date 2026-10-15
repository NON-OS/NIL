import HttpError from './HttpError.js';

// Lets handlers just return data or throw an HttpError.
export default function route(handler) {
  return async (req, res) => {
    try {
      const out = await handler(req, res);
      if (out !== undefined && !res.headersSent) res.json(out);
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      console.error(`[${req.method} ${req.baseUrl}${req.route?.path ?? ''}]`, err);
      if (!res.headersSent) res.status(500).json({ error: 'Something went wrong on the server. Try again.' });
    }
  };
}
