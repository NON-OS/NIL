// "/tasks/{key}/claim" (OpenAPI) → "/tasks/:key/claim" (Express).
export default function expressPath(path) {
  return path.replace(/\{(\w+)\}/g, ':$1');
}
