const COMMON = new Set([
  'password', 'password1', 'password123', '1234567890', '12345678910', 'qwertyuiop', 'iloveyou12',
  'letmein123', 'welcome123', 'admin12345', 'changeme123', 'abc1234567', 'football12', 'qwerty1234',
  '1q2w3e4r5t', 'passw0rd123', 'trustno1234', 'monkey1234', 'dragon1234', 'sunshine12',
]);

// Returns a human-readable reason the password is too weak, or null if it's fine.
export default function passwordProblem(plain, { email = '', name = '' } = {}) {
  if (typeof plain !== 'string' || plain.length < 10) return 'Use a password with at least 10 characters.';
  if (plain.length > 200) return 'That password is too long.';
  const lower = plain.toLowerCase();
  if (COMMON.has(lower)) return 'That password is too common. Pick something less guessable.';
  if (new Set(lower).size < 4) return 'Use a password with more variety.';
  const local = email.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return 'Don’t use your email in your password.';
  const first = name.split(/\s+/)[0]?.toLowerCase();
  if (first && first.length >= 4 && lower.includes(first)) return 'Don’t use your name in your password.';
  return null;
}
