/-!
Two ways a server might show chat as it was before, and how a browser catches them.

Edits. client/src/state/editHistory.ts keeps, for each message, the newest edit number this
browser opened and whether it saw it deleted (stored as -1). `stale` says whether an opened
version is older than that, or brings a deleted message back; `record` keeps the newest.

Late messages. client/src/lib/lateUnderOldKey.ts walks a timeline in the server's order. The
server takes new messages only under a conversation's newest key, and edits are sealed again
under the newest key, so a message under an older key placed after an unedited message under a
newer one went in late.
-/

namespace Nil.ChatHistory

/-! ### Edits -/

/-- What one message's record holds: nothing yet, an edit number, or deleted. -/
inductive Seen where
  | none
  | edit (n : Nat)
  | deleted
  deriving DecidableEq, Repr

/-- editHistory.stale(id, edit, deleted). -/
def stale : Seen → Nat → Bool → Bool
  | .none, _, _ => false
  | .deleted, _, del => !del
  | .edit s, e, _ => decide (e < s)

/-- editHistory.record(id, edit, deleted): deleted stays, otherwise the larger edit. -/
def record : Seen → Nat → Bool → Seen
  | .deleted, _, _ => .deleted
  | _, _, true => .deleted
  | .none, e, false => .edit e
  | .edit s, e, false => .edit (max s e)

/-- What a browser does with each version a server shows: refuse it when stale, else record it. -/
def run (seen : Seen) : List (Nat × Bool) → List Bool
  | [] => []
  | (e, d) :: rest => stale seen e d :: run (if stale seen e d then seen else record seen e d) rest

/-- Once seen deleted, a message never shows again, however the server serves it. -/
theorem deleted_stays (e : Nat) (d : Bool) : stale .deleted e d = !d := rfl

/-- A deletion, once recorded, is never undone by anything recorded after it. -/
theorem record_deleted_absorbs (s : Seen) (e e' : Nat) (d : Bool) : record (record s e true) e' d = .deleted := by
  cases s <;> cases d <;> rfl

/-- After a version is opened, any older one is refused. -/
theorem older_refused (s : Seen) (e e' : Nat) (lt : e' < e) : stale (record s e false) e' false = true := by
  cases s with
  | none => simp [record, stale, lt]
  | deleted => rfl
  | edit n => simp [record, stale]; omega

/-- A server showing each message's versions in the order they were made never trips it. -/
theorem honest_never_stale : ∀ (s : Seen) (vs : List (Nat × Bool)),
    (match s with | .none => True | .edit n => ∀ v ∈ vs, n ≤ v.1 | .deleted => ∀ v ∈ vs, v.2 = true) →
    vs.Pairwise (fun a b => a.1 ≤ b.1 ∧ (a.2 = true → b.2 = true)) →
    run s vs = List.replicate vs.length false
  | _, [], _, _ => rfl
  | s, (e, d) :: rest, hs, hp => by
    have hfresh : stale s e d = false := by
      cases s with
      | none => rfl
      | edit n => have := hs (e, d) (by simp); simp [stale]; omega
      | deleted => have := hs (e, d) (by simp); simp [stale] at this ⊢; exact this
    simp only [run, hfresh, List.length_cons, List.replicate_succ, Bool.false_eq_true, ↓reduceIte]
    congr 1
    apply honest_never_stale _ rest _ hp.of_cons
    have after : ∀ v ∈ rest, e ≤ v.1 ∧ (d = true → v.2 = true) := fun v hv => List.rel_of_pairwise_cons hp hv
    cases s with
    | none =>
      cases d with
      | true => show ∀ v ∈ rest, v.2 = true; exact fun v hv => (after v hv).2 rfl
      | false => show ∀ v ∈ rest, e ≤ v.1; exact fun v hv => (after v hv).1
    | edit n =>
      cases d with
      | true => show ∀ v ∈ rest, v.2 = true; exact fun v hv => (after v hv).2 rfl
      | false =>
        show ∀ v ∈ rest, max n e ≤ v.1
        intro v hv
        have h1 := (after v hv).1
        have h2 := hs v (List.mem_cons_of_mem _ hv)
        omega
    | deleted =>
      have : record .deleted e d = .deleted := by cases d <;> rfl
      rw [this]
      exact fun v hv => hs v (List.mem_cons_of_mem _ hv)

/-! ### Late messages -/

structure Msg where
  epoch : Nat
  edited : Bool
  deriving DecidableEq, Repr

/-- lateUnderOldKey, on a timeline in the server's order: which messages went in late. -/
def late : Nat → List Msg → List Bool
  | _, [] => []
  | newest, m :: rest => decide (m.epoch < newest) :: late (if m.edited then newest else max newest m.epoch) rest

/-- Unedited messages a server took in turn have keys that never go down, so nothing is late. -/
theorem honest_none_late : ∀ (newest : Nat) (ms : List Msg),
    (∀ m ∈ ms, m.edited = false ∧ newest ≤ m.epoch) → ms.Pairwise (fun a b => a.epoch ≤ b.epoch) →
    late newest ms = List.replicate ms.length false
  | _, [], _, _ => rfl
  | newest, m :: rest, hm, hp => by
    have ⟨he, hn⟩ := hm m (by simp)
    simp only [late, he, List.length_cons, List.replicate_succ]
    have : decide (m.epoch < newest) = false := by simp; omega
    rw [this]
    congr 1
    apply honest_none_late
    · intro x hx
      have ⟨hx1, _⟩ := hm x (List.mem_cons_of_mem _ hx)
      exact ⟨hx1, by have := List.rel_of_pairwise_cons hp hx; simp only [Bool.false_eq_true, ↓reduceIte]; omega⟩
    · exact hp.of_cons

theorem late_newest_mono : ∀ (a b : Nat) (ms : List Msg) (i : Nat), a ≤ b →
    (late a ms)[i]? = some true → (late b ms)[i]? = some true
  | _, _, [], _, _, h => by simp [late] at h
  | a, b, m :: rest, 0, hab, h => by
    simp only [late, List.getElem?_cons_zero, Option.some.injEq, decide_eq_true_eq] at h ⊢
    omega
  | a, b, m :: rest, i + 1, hab, h => by
    simp only [late, List.getElem?_cons_succ] at h ⊢
    exact late_newest_mono _ _ rest i (by split <;> omega) h

/-- Any message under an older key placed after an unedited one under a newer key is caught,
wherever in the timeline the two are. -/
theorem late_caught : ∀ (newest : Nat) (pre : List Msg) (n : Msg) (mid : List Msg) (m : Msg),
    n.edited = false → m.epoch < n.epoch →
    (late newest (pre ++ n :: mid ++ [m]))[pre.length + 1 + mid.length]? = some true
  | newest, [], n, mid, m, hn, hlt => by
    simp only [List.nil_append, List.length_nil, Nat.zero_add, List.cons_append, late, hn]
    simp only [Bool.false_eq_true, ↓reduceIte, Nat.add_comm 1, List.getElem?_cons_succ]
    have key : ∀ (k : Nat) (mid : List Msg), n.epoch ≤ k → (late k (mid ++ [m]))[mid.length]? = some true := by
      intro k mid hk
      induction mid generalizing k with
      | nil => simp [late]; omega
      | cons x xs ih =>
        simp only [List.cons_append, late, List.length_cons, List.getElem?_cons_succ]
        exact ih _ (by split <;> omega)
    exact key _ mid (Nat.le_max_right _ _)
  | newest, p :: pre, n, mid, m, hn, hlt => by
    have := late_caught (if p.edited then newest else max newest p.epoch) pre n mid m hn hlt
    simp only [List.cons_append, late, List.length_cons] at this ⊢
    rw [show pre.length + 1 + 1 + mid.length = (pre.length + 1 + mid.length) + 1 by omega, List.getElem?_cons_succ]
    simpa using this

end Nil.ChatHistory
