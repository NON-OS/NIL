import store from '../../../state/store';

const HEX = /^#[0-9A-Fa-f]{6}$/;

// A teammate's cursor: a caret in their avatar's colour with their name, both from this tab's own
// list of teammates. Neither comes from what the cursor itself claims.
export default function caretRender(user: Record<string, unknown>) {
  const known = typeof user.id === 'string' ? store.get().users[user.id] : undefined;
  const color = known?.color && HEX.test(known.color) ? known.color : typeof user.color === 'string' && HEX.test(user.color) ? user.color : '#4A5568';
  const name = known?.name || 'Teammate';
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
