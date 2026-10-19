// Posts one alert to a Telegram chat through the Bot API. The token travels in the URL, so neither
// the URL nor a network error's details are ever logged by the caller; only the status code is.
export default function sendTelegram(telegram, text, fetchImpl) {
  return fetchImpl(`https://api.telegram.org/bot${telegram.token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: telegram.chat, text, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  });
}
