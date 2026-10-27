// The origin Nil gives changes that came from elsewhere (other people, saved versions), so they
// aren't sent back out as this tab's own.
const REMOTE = Symbol('remote');

export default REMOTE;
