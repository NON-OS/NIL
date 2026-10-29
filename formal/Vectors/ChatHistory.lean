import Nil.ChatHistory
import Vectors.Json
import Vectors.Rollback

namespace Vectors
open Nil.ChatHistory

def versionJson (v : Nat × Bool) : Json := .obj [("edit", num v.1), ("deleted", .bool v.2)]

def editsCase (name : String) (vs : List (Nat × Bool)) : Json :=
  .obj [("name", .str name), ("versions", .arr (vs.map versionJson)), ("refused", .arr ((run .none vs).map .bool))]

def randomVersions : Nat → Nat → List (Nat × Bool)
  | 0, _ => []
  | n + 1, s =>
    let s1 := lcg s
    let s2 := lcg s1
    (s1 % 5, s2 % 6 = 0) :: randomVersions n s2

def msgJson (m : Msg) : Json := .obj [("epoch", num m.epoch), ("edited", .bool m.edited)]

def lateCase (name : String) (ms : List Msg) : Json :=
  .obj [("name", .str name), ("messages", .arr (ms.map msgJson)), ("late", .arr ((late 0 ms).map .bool))]

def randomMsgs : Nat → Nat → Nat → List Msg
  | 0, _, _ => []
  | n + 1, e, s =>
    let s1 := lcg s
    let s2 := lcg s1
    -- mostly keys going up, as a server takes them; now and then an old one slipped in
    let epoch := if s1 % 7 = 0 then e - s1 / 7 % (e + 1) else e + s2 % 2
    { epoch, edited := s2 % 5 = 0 } :: randomMsgs n (if s1 % 7 = 0 then e else epoch) s2

def chatHistoryJson : Json :=
  let edits := [
    editsCase "versions in order" [(0, false), (1, false), (2, false)],
    editsCase "an older edit after a newer one" [(2, false), (1, false)],
    editsCase "deleted, then shown again" [(0, false), (1, true), (0, false), (1, false)],
    editsCase "edited, then deleted, then the edit again" [(3, false), (4, true), (3, false)],
    editsCase "the deletion shown twice" [(1, true), (1, true)]] ++
    (List.range 120).map fun i => editsCase s!"generated {i}" (randomVersions (2 + i % 6) (i * 7907 + 1))
  let lates := [
    lateCase "keys going up" [⟨1, false⟩, ⟨1, false⟩, ⟨2, false⟩, ⟨3, false⟩],
    lateCase "an old key slipped in" [⟨1, false⟩, ⟨2, false⟩, ⟨1, false⟩],
    lateCase "an old message edited later" [⟨2, true⟩, ⟨1, false⟩, ⟨2, false⟩],
    lateCase "behind an edit only" [⟨3, true⟩, ⟨1, false⟩]] ++
    (List.range 120).map fun i => lateCase s!"generated {i}" (randomMsgs (2 + i % 8) 1 (i * 6151 + 5))
  .obj [("edits", .arr edits), ("late", .arr lates)]

end Vectors
