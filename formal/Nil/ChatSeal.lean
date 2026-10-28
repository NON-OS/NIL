/-!
When a browser may seal anything in a chat conversation under its current key
(client/src/lib/sealBlockers.ts, which client/src/actions/chat/sealGate.ts applies before every
message, edit, reaction, name and mark). Whoever holds the key reads what is sealed under it, so
the rule is about them: the holders are the people on the epoch's checked member list.

`confirmed` is who this browser confirmed the key of, `members` who the server says is in the
conversation, `epoch` the server's current epoch and `seen` the newest this browser checked.
`forked` is whether the server showed a history other than one checked before, and
`settingsOk` whether the server's settings are the signed ones (not checked when re-signing them).
-/

namespace Nil.ChatSeal

inductive Blocker where
  | history
  | settings
  | unconfirmed
  | holdsOut
  deriving DecidableEq, Repr

structure Gate where
  me : Nat
  holders : List Nat
  confirmed : List Nat
  members : List Nat
  epoch : Nat
  seen : Nat
  forked : Bool
  settingsOk : Bool
  deriving DecidableEq, Repr

/-- sealBlockers: the first reason not to seal, or none. -/
def blocker (g : Gate) : Option Blocker :=
  if g.forked ∨ g.epoch < g.seen then some .history
  else if !g.settingsOk then some .settings
  else if g.holders.any (fun h => h ≠ g.me ∧ !g.confirmed.contains h) then some .unconfirmed
  else if g.holders.any (fun h => !g.members.contains h) then some .holdsOut
  else none

/-- Whatever is sealed is readable only by people whose key this browser confirmed. -/
theorem sealed_only_to_confirmed (g : Gate) (h : blocker g = none) : ∀ x ∈ g.holders, x = g.me ∨ x ∈ g.confirmed := by
  intro x hx
  unfold blocker at h
  split at h; · cases h
  split at h; · cases h
  split at h
  · cases h
  · rename_i hu
    simp only [List.any_eq_true, decide_eq_true_eq, Bool.not_eq_true',
      List.contains_eq_mem, decide_eq_false_iff_not, not_exists, not_and] at hu
    by_cases e : x = g.me
    · exact Or.inl e
    · exact Or.inr (Classical.byContradiction fun hn => hu x hx e hn)

/-- Nothing is sealed while someone the server has as out still holds the key. -/
theorem none_out (g : Gate) (h : blocker g = none) : ∀ x ∈ g.holders, x ∈ g.members := by
  intro x hx
  unfold blocker at h
  split at h; · cases h
  split at h; · cases h
  split at h; · cases h
  split at h
  · cases h
  · rename_i ho
    simp only [List.any_eq_true, Bool.not_eq_true', List.contains_eq_mem, decide_eq_false_iff_not,
      not_exists, not_and, Classical.not_not] at ho
    exact ho x hx

/-- Nothing is sealed under an epoch older than one this browser checked, or another history,
or under settings the server changed. -/
theorem current_and_signed (g : Gate) (h : blocker g = none) : g.seen ≤ g.epoch ∧ g.forked = false ∧ g.settingsOk = true := by
  unfold blocker at h
  split at h
  · cases h
  · rename_i hh
    split at h
    · cases h
    · rename_i hs
      simp only [not_or, Nat.not_lt, Bool.not_eq_true] at hh
      simp only [Bool.not_eq_true', Bool.not_eq_false] at hs
      exact ⟨hh.2, hh.1, by simpa using hs⟩

/-- And when all of that holds, nothing stands in the way. -/
theorem seals_when_safe (g : Gate) (hf : g.forked = false) (he : g.seen ≤ g.epoch) (hs : g.settingsOk = true)
    (hc : ∀ x ∈ g.holders, x = g.me ∨ x ∈ g.confirmed) (hm : ∀ x ∈ g.holders, x ∈ g.members) : blocker g = none := by
  unfold blocker
  rw [if_neg (by simp [hf]; omega), if_neg (by simp [hs])]
  rw [if_neg, if_neg]
  · simp only [List.any_eq_true, Bool.not_eq_true', List.contains_eq_mem, decide_eq_false_iff_not, not_exists, not_and, Classical.not_not]
    exact hm
  · simp only [List.any_eq_true, decide_eq_true_eq, Bool.not_eq_true',
      List.contains_eq_mem, decide_eq_false_iff_not, not_exists, not_and, Classical.not_not]
    intro x hx hne
    rcases hc x hx with e | e
    · exact absurd e hne
    · exact e

end Nil.ChatSeal
