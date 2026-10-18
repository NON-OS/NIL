import Nil.Canonical
import Vectors.Json

namespace Vectors
open Nil.Canonical

def allDigits (s : String) : Bool := !s.isEmpty && s.all Char.isDigit

def stringCase (s : String) : Json :=
  .obj [("s", .str s), ("digits", .bool (allDigits s)), ("canonical", .bool (isCanonical s)),
    ("value", if allDigits s then num (value s.toList) else .null)]

def printed (n : Nat) : Json := .obj [("n", num n), ("s", .str (String.mk (digits n)))]

def nines (k : Nat) : String := String.mk (List.replicate k '9')

def canonicalStrings : List String :=
  let p := toString fieldOrder
  let big := toString (2 ^ 253 + 12345)
  ["0", "1", "7", "10", "07", "007", "00", "000", "0000000000000001", "", " 1", "1 ", "+1", "-1",
    "1e3", "0x10", "1.0", "１", "٣", "abc",
    toString (fieldOrder - 1), "0" ++ toString (fieldOrder - 1), p, toString (fieldOrder + 1),
    nines 76, nines 77, nines 78, nines 79, big, "0" ++ big, "00" ++ big,
    "12345678901234567890123456789012345678901234567890123456789012345678901234567"]

def canonicalJson : Json :=
  .obj [("fieldOrder", num fieldOrder),
    ("strings", .arr (canonicalStrings.map stringCase)),
    ("printed", .arr ([0, 1, 9, 10, 99, 100, 1000000007, 2 ^ 64, 2 ^ 253, fieldOrder - 1].map printed))]

end Vectors
