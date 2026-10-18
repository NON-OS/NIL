import Nil.Tally
import Vectors.Json

namespace Vectors
open Nil.Tally

/-- The order of Baby Jubjub's prime subgroup, subOrder in @zk-kit/baby-jubjub. -/
def subOrder : Nat :=
  2736030358979909402780800718157159386076813972158567259200215660948447373041

def powMod (b e m : Nat) : Nat := Id.run do
  let mut r := 1
  let mut b := b % m
  let mut e := e
  while e > 0 do
    if e % 2 = 1 then r := r * b % m
    b := b * b % m
    e := e / 2
  return r

def modq (n : Int) : Nat := (n % (subOrder : Int)).toNat

/-- The inverse modulo the prime subOrder, by Fermat's little theorem, as combineTotals does. -/
def inv (n : Int) : Nat := powMod (modq n) (subOrder - 2) subOrder

def pairCase (x c : Int) (a b : Int) : Json :=
  let la := modq (lagrangeA b (inv (b - a)))
  let lb := modq (lagrangeB a (inv (a - b)))
  .obj [("a", int a), ("b", int b), ("la", num la), ("lb", num lb),
    ("combined", num ((la * modq (share x c a) + lb * modq (share x c b)) % subOrder))]

def tallyCase (x c : Int) (ballots : List (List (Int × Int))) : Json :=
  let options := (ballots.headD []).length
  let totals := (List.range options).map fun k =>
    totalChoice (ballots.map fun b => let (m, r) := b.getD k (0, 0); ({ m, r } : Ballot))
  .obj [("x", num (modq x)), ("c", num (modq c)),
    ("shares", .arr ([1, 2, 3].map fun i => num (modq (share x c i)))),
    ("pairs", .arr [pairCase x c 1 2, pairCase x c 1 3, pairCase x c 2 3, pairCase x c 3 1]),
    ("ballots", .arr (ballots.map fun b => .arr (b.map fun (m, r) => .obj [("m", int m), ("r", num (modq r))]))),
    ("totals", .arr (totals.map int))]

def tallyJson : Json :=
  .obj [("subOrder", num subOrder), ("cases", .arr [
    tallyCase 123456789 987654321 [[(1, 11), (0, 12)], [(0, 13), (1, 14)], [(1, 15), (0, 16)]],
    tallyCase (2 ^ 200 + 3) (2 ^ 180 + 7) [[(3, 2 ^ 100), (0, 5), (2, 9)], [(0, 77), (4, 2 ^ 90), (1, 3)]],
    tallyCase 42 (-5) [[(1, 1)]]])]

end Vectors
