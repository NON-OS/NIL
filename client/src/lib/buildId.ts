// The id `npm run build` stamped into this page, or null when it runs from the dev server.
const buildId = document.querySelector<HTMLMetaElement>('meta[name="nil-build"]')?.content || null;

export default buildId;
