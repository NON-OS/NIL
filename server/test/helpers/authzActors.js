// Who the authorization matrix calls every route as, and the groups its rows allow.
const ALL = ['anon', 'stranger', 'outsider', 'guest', 'member', 'admin', 'owner', 'agentRead', 'agentWrite'];
const PEOPLE = ['guest', 'member', 'admin', 'owner'];
const MEMBERS = ['member', 'admin', 'owner'];
const ADMINS = ['admin', 'owner'];

export default Object.freeze({ ALL, PEOPLE, MEMBERS, ADMINS, OWNER: ['owner'], NOBODY: [], SIGNED_OUT: ['anon', 'stranger', 'outsider'], AGENTS: ['agentRead', 'agentWrite'] });
