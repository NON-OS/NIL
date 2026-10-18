/-!
Rollback detection for private tasks, as the browser does it. client/src/lib/isRollback.ts
decides whether to warn; client/src/state/taskVersions.ts keeps the newest revision this browser
has seen for each task. taskSeal.open calls isRollback with the revisions of the pieces it
decrypted and the seen revision, then records the newest piece. putTasks records the revision of
a ciphertext this tab wrote or opened when the server hands it back. Tasks are independent, so
the model follows one task.
-/

namespace Nil.Rollback

/-- isRollback(revs, seen): the pieces disagree, or the first is below what was seen. -/
def isRollback (revs : List Nat) (seen : Nat) : Bool :=
  match revs with
  | [] => false
  | r :: _ => revs.any (fun x => x != r) || decide (r < seen)

/-- taskVersions.record: keep the larger revision. -/
def record (seen rev : Nat) : Nat := if seen < rev then rev else seen

inductive Event where
  /-- taskSeal.open decrypted the task's pieces at these revisions. -/
  | opened (revs : List Nat)
  /-- putTasks got back a ciphertext this tab already knows, at this revision. -/
  | held (rev : Nat)
  deriving Repr, DecidableEq

/-- The revision an event leaves recorded: Math.max(...revs) for an open. -/
def Event.rev : Event → Nat
  | .opened revs => revs.foldl max 0
  | .held rev => rev

def Event.warns (seen : Nat) : Event → Bool
  | .opened revs => isRollback revs seen
  | .held _ => false

def seenAfter (seen : Nat) (es : List Event) : Nat := es.foldl (fun s e => record s e.rev) seen

/-- The warning raised at each event, starting from a recorded revision (0 when none). -/
def run (seen : Nat) : List Event → List Bool
  | [] => []
  | e :: es => e.warns seen :: run (record seen e.rev) es

/-- A server that serves every piece of a task at one revision. -/
def Event.uniform : Event → Prop
  | .opened revs => ∃ r k, revs = List.replicate (k + 1) r
  | .held _ => True

theorem record_eq_max (s r : Nat) : record s r = max s r := by
  simp only [record, Nat.max_def]; split <;> split <;> omega

theorem foldl_max_replicate (r k : Nat) : (List.replicate (k + 1) r).foldl max 0 = r := by
  have : ∀ (n a : Nat), a ≤ r → (List.replicate n r).foldl max a = if n = 0 then a else r := by
    intro n; induction n with
    | zero => intro a _; simp
    | succ n ih =>
      intro a ha
      simp only [List.replicate_succ, List.foldl_cons]
      rw [ih (max a r) (by omega)]; simp; omega
  rw [this _ _ (Nat.zero_le _)]; simp

/-- An honest server, serving each task's pieces at one revision that never goes down, never
makes Nil warn. -/
theorem honest_never_warns (es : List Event) (seen : Nat)
    (uniform : ∀ e ∈ es, e.uniform) (fresh : ∀ e ∈ es, seen ≤ e.rev)
    (nondecreasing : es.Pairwise fun a b => a.rev ≤ b.rev) :
    run seen es = List.replicate es.length false := by
  induction es generalizing seen with
  | nil => rfl
  | cons e es ih =>
    simp only [run, List.length_cons, List.replicate_succ]
    have he := fresh e (by simp)
    have hrec : record seen e.rev = e.rev := by rw [record_eq_max]; omega
    rw [ih (record seen e.rev) (fun x hx => uniform x (by simp [hx]))
      (fun x hx => by rw [hrec]; exact List.rel_of_pairwise_cons nondecreasing hx)
      nondecreasing.of_cons]
    congr
    cases e with
    | held _ => rfl
    | opened revs =>
      obtain ⟨r, k, rfl⟩ := uniform (.opened revs) (by simp)
      simp only [Event.rev, foldl_max_replicate] at he
      simp [Event.warns, isRollback, List.replicate_succ]
      exact he

theorem seen_le_seenAfter (seen : Nat) (es : List Event) : seen ≤ seenAfter seen es := by
  induction es generalizing seen with
  | nil => exact Nat.le_refl _
  | cons e es ih =>
    exact Nat.le_trans (by rw [record_eq_max]; omega) (ih (record seen e.rev))

theorem rev_le_seenAfter (seen : Nat) (es : List Event) (e : Event) (h : e ∈ es) :
    e.rev ≤ seenAfter seen es := by
  induction es generalizing seen with
  | nil => simp at h
  | cons x es ih =>
    simp only [seenAfter, List.foldl_cons] at *
    rcases List.mem_cons.1 h with rfl | h
    · exact Nat.le_trans (by rw [record_eq_max]; omega) (seen_le_seenAfter _ es)
    · exact ih _ h

/-- The warning at an open is exactly: its pieces disagree, or they are older than the newest
revision recorded before it. -/
theorem warns_iff (seen r : Nat) (rest : List Nat) :
    (Event.opened (r :: rest)).warns seen = true ↔ (∃ x ∈ rest, x ≠ r) ∨ r < seen := by
  simp [Event.warns, isRollback, List.any_eq_true]

/-- After any history, opening a task whose pieces are older than one this browser opened or
wrote before always warns. -/
theorem older_always_warns (seen : Nat) (es : List Event) (e : Event) (he : e ∈ es)
    (r : Nat) (rest : List Nat) (older : r < e.rev) :
    (Event.opened (r :: rest)).warns (seenAfter seen es) = true :=
  (warns_iff _ _ _).2 (Or.inr (Nat.lt_of_lt_of_le older (rev_le_seenAfter seen es e he)))

/-- Opening a task whose pieces come from different revisions always warns, whatever was seen. -/
theorem mixed_always_warns (seen r : Nat) (rest : List Nat) (mixed : ∃ x ∈ rest, x ≠ r) :
    (Event.opened (r :: rest)).warns seen = true :=
  (warns_iff _ _ _).2 (Or.inl mixed)

theorem run_append (seen : Nat) (es : List Event) (e : Event) :
    run seen (es ++ [e]) = run seen es ++ [e.warns (seenAfter seen es)] := by
  induction es generalizing seen with
  | nil => rfl
  | cons x es ih => simp [run, ih, seenAfter]

end Nil.Rollback
