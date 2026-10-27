import envFlag from './envFlag.js';

// Whether calls are on: CALLS, and never on an onion address. Tor carries TCP alone, and a call
// needs UDP and a path between two browsers. Kept apart from config/calls.js so the security
// headers can ask without loading the rest of the settings.
function onionSite() {
  try {
    return new URL((process.env.APP_URL ?? '').trim()).hostname.endsWith('.onion');
  } catch {
    return false;
  }
}

const onion = onionSite();

export default Object.freeze({ enabled: envFlag('CALLS', true) && !onion, onion });
