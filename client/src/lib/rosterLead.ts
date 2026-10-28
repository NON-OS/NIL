// Who manages a conversation after a checked member list: the managers it names, or, when it
// names none (they all left), everyone in it. The same rule chatRosterRule applies.
export default function rosterLead(list: { members: string[]; managers: string[] }) {
  return list.managers.length ? list.managers : list.members;
}
