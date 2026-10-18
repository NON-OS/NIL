import crypto from 'node:crypto';

// What an AI credit's proof signs: the feature and the exact request text. A proof lifted off one
// request can't carry a different prompt, or the same prompt to a different feature.
export default function creditMessage(feature, payload) {
  const text = `nil/ai-credit/v1|message|${feature}|${payload}`;
  return BigInt(`0x${crypto.createHash('sha256').update(text).digest('hex').slice(0, 62)}`).toString();
}
