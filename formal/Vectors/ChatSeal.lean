import Nil.ChatSeal
import Vectors.Json
import Vectors.Rollback
import Vectors.ChatRoster

namespace Vectors
open Nil.ChatSeal

def blockerJson : Option Blocker → Json
  | none => .null
  | some .history => .str "history"
  | some .settings => .str "settings"
  | some .unconfirmed => .str "unconfirmed"
  | some .holdsOut => .str "holdsOut"

def sealCase (name : String) (g : Gate) : Json :=
  .obj [("name", .str name), ("me", num g.me), ("holders", nums g.holders), ("confirmed", nums g.confirmed),
    ("members", nums g.members), ("epoch", num g.epoch), ("seen", num g.seen), ("forked", .bool g.forked),
    ("settingsOk", .bool g.settingsOk), ("blocker", blockerJson (blocker g))]

def randomGate (i s : Nat) : Json :=
  let s1 := lcg s
  let s2 := lcg s1
  let s3 := lcg s2
  let s4 := lcg s3
  let holders := (1 :: pick (s1 % 16)).eraseDups
  let g : Gate := {
    me := 1, holders,
    confirmed := if s2 % 3 = 0 then holders else pick (s2 / 3 % 16),
    members := if s3 % 3 = 0 then holders else pick (s3 / 3 % 16) ++ [1],
    epoch := 3, seen := if s4 % 6 = 0 then 4 else 3 - s4 / 6 % 3,
    forked := s4 % 11 = 0, settingsOk := s4 % 7 ≠ 0 }
  sealCase s!"generated {i}" g

def chatSealJson : Json :=
  let base : Gate := { me := 1, holders := [1, 2, 3], confirmed := [2, 3], members := [1, 2, 3], epoch := 3, seen := 3, forked := false, settingsOk := true }
  let named := [
    sealCase "everyone confirmed, nobody out" base,
    sealCase "one holder not confirmed" { base with confirmed := [2] },
    sealCase "someone out still holds the key" { base with members := [1, 2] },
    sealCase "an older key than seen" { base with epoch := 2 },
    sealCase "another history" { base with forked := true },
    sealCase "settings the server changed" { base with settingsOk := false },
    sealCase "alone in it" { base with holders := [1], confirmed := [] }]
  .obj [("cases", .arr (named ++ (List.range 200).map fun i => randomGate i (i * 92821 + 11)))]

end Vectors
