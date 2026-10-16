// Says at startup that a setting was ignored and what happens instead, so a typo in .env never
// changes how the server behaves without anyone noticing.
export default function configWarning(message) {
  console.warn(`[config] ${message}`);
}
