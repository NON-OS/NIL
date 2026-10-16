// Every error from the agent API has this one shape, so clients can branch on `code`.
export default function sendError(res, status, code, message) {
  res.status(status).json({ error: { status, code, message } });
}
