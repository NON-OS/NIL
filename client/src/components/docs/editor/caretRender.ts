import store from '../../../state/store';

// A teammate's cursor: a coloured caret with their name from this tab's own list of teammates.
// The name never comes from what the cursor itself claims.
export default function caretRender(user: Record<string, unknown>) {
  const color = typeof user.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(user.color) ? user.color : '#4A5568';
  const name = (typeof user.id === 'string' && store.get().users[user.id]?.name) || 'Teammate';
  const caret = document.createElement('span');
  caret.className = 'doc-caret';
  caret.style.borderColor = color;
  const label = document.createElement('span');
  label.className = 'doc-caret-label';
  label.style.backgroundColor = color;
  label.textContent = name;
  caret.append(label);
  return caret;
}
