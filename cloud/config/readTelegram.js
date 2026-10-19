// Telegram as an alert channel: a bot token from @BotFather and the chat the bot posts in. Both or
// neither; the token is never repeated in a warning, since anyone holding it can post as the bot.
const TOKEN = /^\d{5,}:[A-Za-z0-9_-]{30,}$/;
const CHAT = /^(-?\d{5,}|@[A-Za-z][A-Za-z0-9_]{4,})$/;

export default function readTelegram(read) {
  const token = read.text('CLOUD_ALERT_TELEGRAM_TOKEN');
  const chat = read.text('CLOUD_ALERT_TELEGRAM_CHAT');
  if (!token && !chat) return null;
  if (!token || !chat) {
    read.warn('Telegram alerts need both CLOUD_ALERT_TELEGRAM_TOKEN and CLOUD_ALERT_TELEGRAM_CHAT. They’re off.');
    return null;
  }
  if (!TOKEN.test(token)) {
    read.warn('CLOUD_ALERT_TELEGRAM_TOKEN doesn’t look like a bot token from @BotFather. Telegram alerts are off.');
    return null;
  }
  if (!CHAT.test(chat)) {
    read.warn(`CLOUD_ALERT_TELEGRAM_CHAT=${chat} isn’t a chat id (a number, negative for groups) or an @channel name. Telegram alerts are off.`);
    return null;
  }
  return Object.freeze({ token, chat });
}
