import Vectors

/-!
Writes the test vectors the JavaScript tests read: `lake exe vectors <dir>`.
-/

open Vectors

def main (args : List String) : IO Unit := do
  let dir := args.headD "vectors"
  IO.FS.createDirAll dir
  for (name, json) in [("canonical", canonicalJson), ("rollback", rollbackJson),
      ("invoice", invoiceJson), ("tally", tallyJson), ("chat-roster", chatRosterJson),
      ("chat-streams", chatStreamsJson), ("chat-history", chatHistoryJson),
      ("chat-seal", chatSealJson)] do
    IO.FS.writeFile s!"{dir}/{name}.json" (json.render ++ "\n")
    IO.println s!"wrote {dir}/{name}.json"
