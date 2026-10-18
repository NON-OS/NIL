import Nil.Rollback
import Vectors.Json

namespace Vectors
open Nil.Rollback

def eventJson : Event → Json
  | .opened revs => .obj [("opened", nums revs)]
  | .held rev => .obj [("held", num rev)]

def sequenceCase (name : String) (es : List Event) : Json :=
  .obj [("name", .str name), ("events", .arr (es.map eventJson)),
    ("warnings", .arr ((run 0 es).map .bool))]

/-- A small linear congruential generator, so the generated sequences are the same every run. -/
def lcg (s : Nat) : Nat := (s * 1103515245 + 12345) % 2147483648

def randomEvents : Nat → Nat → List Event
  | 0, _ => []
  | n + 1, s =>
    let s1 := lcg s
    let s2 := lcg s1
    let s3 := lcg s2
    let s4 := lcg s3
    let e := if s1 % 5 = 0 then Event.held (s2 % 5)
      else Event.opened ([s2 % 5, s3 % 5] ++ if s4 % 2 = 0 then [s4 / 2 % 5] else [])
    e :: randomEvents n s4

def rollbackJson : Json :=
  let named := [
    ("honest server, revisions go up", [.opened [1, 1, 1], .opened [2, 2], .opened [2, 2, 2], .opened [5, 5, 5]]),
    ("same revision opened again", [.opened [3, 3, 3], .opened [3, 3, 3]]),
    ("older revision after a newer one", [.opened [4, 4, 4], .opened [3, 3, 3]]),
    ("pieces from different revisions", [.opened [2, 2, 1]]),
    ("description newer than title", [.opened [1, 1, 2]]),
    ("own save held, then an older open", [.opened [1, 1], .held 2, .opened [1, 1, 1]]),
    ("own save held, then that revision", [.opened [1, 1], .held 2, .opened [2, 2, 2]]),
    ("first open at revision zero", [.opened [0, 0]]),
    ("a held revision never warns", [.opened [3, 3], .held 1, .held 0, .opened [3, 3]]),
    ("rollback to zero", [.opened [7, 7, 7], .opened [0, 0, 0]])]
  let random := (List.range 40).map fun i =>
    (s!"generated {i}", randomEvents (2 + i % 6) (i * 7919 + 17))
  .obj [("sequences", .arr ((named ++ random).map fun (n, es) => sequenceCase n es))]

end Vectors
