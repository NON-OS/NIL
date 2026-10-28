import Nil.ChatStreams
import Vectors.Json
import Vectors.Rollback

namespace Vectors
open Nil.ChatStreams

def optNum : Option Nat → Json
  | none => .null
  | some n => num n

def itemJson (i : Item) : Json :=
  .obj [("seq", num i.seq), ("n", num i.n), ("id", num i.id), ("sender", num i.sender),
    ("stream", num i.stream), ("ttl", optNum i.ttl)]

def markJson (m : Mark) : Json :=
  .obj [("sender", num m.sender), ("stream", num m.stream), ("n", num m.n), ("until", optNum m.expiry)]

def noticeJson (x : Notice) : Json :=
  .obj [("kind", .str (if x.1 = 0 then "missing" else if x.1 = 1 then "replayed" else "reordered")),
    ("sender", num x.2.1), ("count", num x.2.2)]

def streamsCase (name : String) (items : List Item) (fromStart : Bool) (marks : List Mark) (now : Nat) : Json :=
  .obj [("name", .str name), ("items", .arr (items.map itemJson)), ("fromStart", .bool fromStart),
    ("marks", .arr (marks.map markJson)), ("now", num now),
    ("notices", .arr ((notices items fromStart marks now).map noticeJson))]

/-- Numbers the server's order 1, 2, 3… -/
def numberSeq (items : List Item) : List Item :=
  (items.zip (List.range items.length)).map fun (i, k) => { i with seq := k + 1 }

def msg (sender stream n : Nat) (ttl : Option Nat := none) (id : Nat := sender * 1000 + stream * 100 + n) : Item :=
  { seq := 0, n, id, sender, stream, ttl }

/-- A tab's messages from..to, in order. -/
def run (sender stream fromN toN : Nat) (ttl : Option Nat := none) : List Item :=
  (List.range (toN + 1 - fromN)).map fun k => msg sender stream (fromN + k) ttl

/-- What a server might do to a tab's honest run: drop, send again under another id, swap
neighbours, or mix in another tab. -/
def mangle (s : Nat) (items : List Item) : List Item :=
  let s1 := lcg s
  let s2 := lcg s1
  let s3 := lcg s2
  let k := items.length
  if k = 0 then items
  else
    let j := s1 % k
    match s2 % 5 with
    | 0 => items.eraseIdx j
    | 1 => match items[j]? with
      | some x => items ++ [{ x with id := x.id + 50 }]
      | none => items
    | 2 => if j + 1 < k then
        match items[j]?, items[j + 1]? with
        | some a, some b => (items.set j b).set (j + 1) a
        | _, _ => items
      else items
    | 3 => if s3 % 2 = 0 then items.take j else items.drop j
    | _ => items

def randomStreams (i s : Nat) : Json :=
  let s1 := lcg s
  let s2 := lcg s1
  let s3 := lcg s2
  let s4 := lcg s3
  let s5 := lcg s4
  let ttlA : Option Nat := if s1 % 4 = 0 then some 3600 else none
  let ttlB : Option Nat := if s2 % 4 = 0 then some 60 else none
  let a := mangle s3 (run 1 1 (s1 % 3 + 1) (s1 % 3 + 2 + s2 % 6) ttlA)
  let b := mangle s4 (run 2 2 1 (1 + s3 % 5) ttlB)
  let c := if s5 % 3 = 0 then mangle s5 (run 1 3 1 (1 + s5 % 4)) else []
  -- interleave the tabs the way a server might deliver them
  let mixed := if s5 % 2 = 0 then a ++ b ++ c else b ++ c ++ a
  let items := numberSeq mixed
  let marks := (if s4 % 3 = 0 then [{ sender := 1, stream := 1, n := s1 % 9, expiry := if s2 % 5 = 0 then some 100 else none : Mark }] else []) ++
    (if s5 % 4 = 0 then [{ sender := 2, stream := 2, n := s3 % 7, expiry := none : Mark }] else []) ++
    (if s1 % 7 = 0 then [{ sender := 3, stream := 9, n := 2, expiry := none : Mark }] else [])
  streamsCase s!"generated {i}" items (s2 % 3 ≠ 0) marks (if s3 % 2 = 0 then 50 else 200)

def chatStreamsJson : Json :=
  let named := [
    streamsCase "an honest server" (numberSeq (run 1 1 1 5)) true [] 0,
    streamsCase "one held back in the middle" (numberSeq ((run 1 1 1 5).eraseIdx 2)) false [] 0,
    streamsCase "the first held back, from the start" (numberSeq (run 1 1 2 5)) true [] 0,
    streamsCase "the first held back, not from the start" (numberSeq (run 1 1 2 5)) false [] 0,
    streamsCase "sent twice under another id" (numberSeq (run 1 1 1 3 ++ [msg 1 1 2 (id := 77)])) false [] 0,
    streamsCase "the same message twice" (numberSeq (run 1 1 1 3 ++ [msg 1 1 2])) false [] 0,
    streamsCase "two swapped" (numberSeq [msg 1 1 1, msg 1 1 3, msg 1 1 2]) false [] 0,
    streamsCase "the last held back, the mark says so" (numberSeq (run 1 1 1 4)) false [⟨1, 1, 6, none⟩] 0,
    streamsCase "the mark matches" (numberSeq (run 1 1 1 4)) false [⟨1, 1, 4, none⟩] 0,
    streamsCase "an expired mark" (numberSeq (run 1 1 1 4)) false [⟨1, 1, 6, some 10⟩] 10,
    streamsCase "a mark with nothing delivered, from the start" [] true [⟨1, 1, 3, none⟩] 0,
    streamsCase "a mark with nothing delivered, mid-timeline" [] false [⟨1, 1, 3, none⟩] 0,
    streamsCase "disappearing messages leave their gaps" (numberSeq [msg 1 1 4 (some 60), msg 1 1 5 (some 60)]) true [] 0,
    streamsCase "a gap between two that disappear alike" (numberSeq [msg 1 1 4 (some 60), msg 1 1 6 (some 60)]) false [] 0,
    streamsCase "a gap across a change of setting" (numberSeq [msg 1 1 1, msg 1 1 4 (some 60)]) false [] 0,
    streamsCase "two tabs of one sender" (numberSeq (run 1 1 1 3 ++ run 1 2 1 3)) true [] 0,
    streamsCase "someone else's numbers under one stream name" (numberSeq (run 1 1 1 2 ++ run 2 1 4 5)) false [] 0]
  let random := (List.range 300).map fun i => randomStreams i (i * 15485863 + 3)
  .obj [("cases", .arr (named ++ random))]

end Vectors
