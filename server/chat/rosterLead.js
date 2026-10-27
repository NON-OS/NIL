// Who manages a conversation after a member list: the managers it names, or, when it names none
// (they all left), everyone in it. The same rule rosterRule applies, and browsers too.
export default function rosterLead(list) {
  return list.managers.length ? list.managers : list.members;
}
