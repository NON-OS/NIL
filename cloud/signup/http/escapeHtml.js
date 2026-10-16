const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export default function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
}
