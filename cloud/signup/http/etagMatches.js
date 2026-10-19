// Whether an If-None-Match header names this ETag. The comparison is the weak one RFC 9110 asks
// for here, so W/"x" matches "x", a list matches if any of it does, and * matches anything.
export default function etagMatches(header, etag) {
  if (!header) return false;
  const bare = etag.replace(/^W\//, '');
  return header.split(',').some((part) => {
    const tag = part.trim();
    return tag === '*' || tag.replace(/^W\//, '') === bare;
  });
}
