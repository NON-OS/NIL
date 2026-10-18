/-!
Just enough JSON to write test vectors. Big numbers are written as decimal strings, which the
JavaScript tests read with BigInt.
-/

namespace Vectors

inductive Json where
  | str (s : String)
  | bool (b : Bool)
  | null
  | arr (xs : List Json)
  | obj (kvs : List (String × Json))

def hex4 (n : Nat) : String :=
  let d := Nat.toDigits 16 n
  String.mk (List.replicate (4 - d.length) '0' ++ d)

def escape (s : String) : String :=
  s.foldl (fun acc c =>
    if c = '"' then acc ++ "\\\""
    else if c = '\\' then acc ++ "\\\\"
    else if c.toNat < 0x20 || c.toNat > 0x7e then
      if c.toNat < 0x10000 then acc ++ "\\u" ++ hex4 c.toNat
      else
        let v := c.toNat - 0x10000
        acc ++ "\\u" ++ hex4 (0xD800 + v / 0x400) ++ "\\u" ++ hex4 (0xDC00 + v % 0x400)
    else acc.push c) ""

partial def Json.render (indent : String := "") : Json → String
  | .str s => "\"" ++ escape s ++ "\""
  | .bool b => if b then "true" else "false"
  | .null => "null"
  | .arr [] => "[]"
  | .arr xs =>
    let inner := indent ++ "  "
    "[\n" ++ ",\n".intercalate (xs.map fun x => inner ++ x.render inner) ++ "\n" ++ indent ++ "]"
  | .obj [] => "{}"
  | .obj kvs =>
    let inner := indent ++ "  "
    "{\n" ++ ",\n".intercalate (kvs.map fun (k, v) => inner ++ "\"" ++ escape k ++ "\": " ++
      v.render inner) ++ "\n" ++ indent ++ "}"

def num (n : Nat) : Json := .str (toString n)
def int (n : Int) : Json := .str (toString n)
def nums (ns : List Nat) : Json := .arr (ns.map num)

end Vectors
