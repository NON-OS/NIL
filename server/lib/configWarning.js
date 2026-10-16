import log from './log.js';

let issued = 0;

// Says at startup that a setting was ignored and what happens instead, so a typo in .env never
// changes how the server behaves without anyone noticing. With STRICT_CONFIG on, any warning
// stops the server instead (config.js counts them once every setting is read).
export default function configWarning(message) {
  issued++;
  log.warn('config', message);
}

configWarning.count = () => issued;
