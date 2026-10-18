// Whether two logs say the same thing: the contract, every topic and the data.
export default function sameLog(a, b) {
  if (!a || !b) return false;
  const topics = (log) => (log.topics ?? []).map((t) => String(t).toLowerCase()).join(',');
  return String(a.address).toLowerCase() === String(b.address).toLowerCase() && topics(a) === topics(b) && String(a.data).toLowerCase() === String(b.data).toLowerCase();
}
