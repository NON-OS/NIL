import Nil.ChatRoster
import Vectors.Json
import Vectors.Rollback

namespace Vectors
open Nil.ChatRoster

def kindJson : Kind → Json
  | .channel => .str "channel"
  | .dm => .str "dm"
  | .group => .str "group"

def audienceJson : Audience → Json
  | .team => .str "team"
  | .people => .str "people"

def listJson (r : RList) : Json :=
  .obj [("kind", kindJson r.kind), ("audience", audienceJson r.audience), ("members", nums r.members),
    ("managers", nums r.managers), ("time", num r.time)]

def rosterCase (name : String) (next : RList) (signer : Nat) (prev : Option RList) (linked : Bool)
    (proven : List Nat) : Json :=
  .obj [("name", .str name), ("next", listJson next), ("signer", num signer),
    ("prev", match prev with | none => .null | some p => listJson p), ("linked", .bool linked),
    ("proven", nums proven), ("allowed", .bool (allowed next signer prev linked proven))]

/-- The people 1 to 4 picked out by the low bits of `mask`, in order. -/
def pick (mask : Nat) : List Nat := (List.range 4).filterMap fun i => if mask / 2 ^ i % 2 = 1 then some (i + 1) else none

def kindOf (n : Nat) : Kind := if n % 3 = 0 then .channel else if n % 3 = 1 then .group else .dm

/-- A list shaped the way the parser accepts one: sorted, managers among members, and for a
group or direct message everyone a manager. -/
def shaped (kind : Kind) (audience : Audience) (members : List Nat) (mgrMask time : Nat) : RList :=
  let managers := if kind = .channel then members.filter (fun x => (pick mgrMask).contains x) else members
  { kind, audience, members, managers, time }

/-- A next list made from `prev` the way a browser might, or a server pretending to: people come
and go, managers change, time moves or doesn't, the link holds or not. -/
def randomCase (i s : Nat) : Json :=
  let s1 := lcg s
  let s2 := lcg s1
  let s3 := lcg s2
  let s4 := lcg s3
  let s5 := lcg s4
  let s6 := lcg s5
  let kind := kindOf s1
  let audience := if kind = .channel ∧ s2 % 2 = 0 then Audience.team else .people
  let pm := if kind = .dm then [1, 2] else pick (s2 / 2 % 16 ||| 1)
  let prev := shaped kind audience pm (s3 % 16) 10
  let nm := if kind = .dm then (if s4 % 5 = 0 then [1, 3] else [1, 2])
    else if s4 % 3 = 0 then pm else pick (s4 / 3 % 16)
  let keepManagers := s5 % 2 = 0
  let next0 := shaped kind audience nm (s5 / 2 % 16) (if s6 % 7 = 0 then 10 else 11)
  let next := if keepManagers ∧ kind = .channel then
      { next0 with managers := prev.managers.filter fun x => !(dropped prev.members nm).contains x }
    else next0
  let next := if s6 % 11 = 0 then { next with kind := kindOf (s6 / 11) } else next
  let signer := s6 / 3 % 5 + 1
  let linked := s6 / 7 % 9 ≠ 0
  let proven := pick (s6 / 13 % 16)
  let first := s1 % 13 = 0
  rosterCase s!"generated {i}" next signer (if first then none else some prev) linked proven

def chatRosterJson : Json :=
  let ch (members managers : List Nat) (time : Nat) (audience := Audience.people) : RList :=
    { kind := .channel, audience, members, managers, time }
  let grp (members : List Nat) (time : Nat) : RList := { kind := .group, audience := .people, members, managers := members, time }
  let dmL (members : List Nat) (time : Nat) : RList := { kind := .dm, audience := .people, members, managers := members, time }
  let named := [
    rosterCase "first list by its manager" (ch [1, 2] [1] 1) 1 none true [],
    rosterCase "first list by someone it doesn't name a manager" (ch [1, 2] [1] 1) 2 none true [],
    rosterCase "first list pointing at a list before it" (ch [1, 2] [1] 1) 1 none false [],
    rosterCase "same people, new key, by a member" (ch [1, 2, 3] [1] 2) 2 (some (ch [1, 2, 3] [1] 1)) true [],
    rosterCase "a member leaves someone out without proof" (ch [1, 2] [1] 2) 2 (some (ch [1, 2, 3] [1] 1)) true [],
    rosterCase "a member leaves someone out, citing their leaving" (ch [1, 2] [1] 2) 2 (some (ch [1, 2, 3] [1] 1)) true [3],
    rosterCase "a member leaves the manager out, citing nothing" (ch [2, 3] [] 2) 2 (some (ch [1, 2, 3] [1] 1)) true [],
    rosterCase "a manager takes someone out" (ch [1, 2] [1] 2) 1 (some (ch [1, 2, 3] [1] 1)) true [],
    rosterCase "a member makes themselves a manager" (ch [1, 2, 3] [1, 2] 2) 2 (some (ch [1, 2, 3] [1] 1)) true [],
    rosterCase "a member brings someone into a private channel" (ch [1, 2, 3, 4] [1] 2) 2 (some (ch [1, 2, 3] [1] 1)) true [],
    rosterCase "a member brings a teammate into a team channel" (ch [1, 2, 3, 4] [1] 2 .team) 2 (some (ch [1, 2, 3] [1] 1 .team)) true [],
    rosterCase "someone outside signs the next list" (ch [1, 2, 4] [1] 2) 4 (some (ch [1, 2] [1] 1)) true [],
    rosterCase "a list dated no later than the one before" (ch [1, 2] [1] 1) 1 (some (ch [1, 2] [1] 1)) true [],
    rosterCase "a list that doesn't name the one before" (ch [1, 2] [1] 2) 1 (some (ch [1, 2] [1] 1)) false [],
    rosterCase "a channel turned into a group" (grp [1, 2] 2) 1 (some (ch [1, 2] [1] 1)) true [],
    rosterCase "a direct message, new key" (dmL [1, 2] 2) 2 (some (dmL [1, 2] 1)) true [],
    rosterCase "a direct message with someone else in it" (dmL [1, 3] 2) 1 (some (dmL [1, 2] 1)) true [],
    rosterCase "a group member leaves, another moves on" (grp [1, 2] 2) 1 (some (grp [1, 2, 3] 1)) true [],
    rosterCase "a group whose managers aren't everyone" ({ grp [1, 2] 2 with managers := [1] }) 1 (some (grp [1, 2] 1)) true []]
  let random := (List.range 300).map fun i => randomCase i (i * 104729 + 7)
  .obj [("cases", .arr (named ++ random))]

end Vectors
