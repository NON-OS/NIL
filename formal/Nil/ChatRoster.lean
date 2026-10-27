/-!
Who may change who holds a chat conversation's key. Every epoch's member list is signed by
whoever starts the epoch, and every browser checks each list against the one before with
client/src/lib/chatRosterRule.ts; the server applies the same rule with server/chat/rosterRule.js
before it takes a list. The model follows both, with people as numbers. `linked` says the list
names the hash of the list before it (or none, for a first list), and `proven` is who has a
signed departure that counts. Lists are sorted, so list equality is the code's `same`.
-/

namespace Nil.ChatRoster

inductive Kind where
  | channel
  | dm
  | group
  deriving DecidableEq, Repr

inductive Audience where
  | team
  | people
  deriving DecidableEq, Repr

structure RList where
  kind : Kind
  audience : Audience
  members : List Nat
  managers : List Nat
  time : Nat
  deriving DecidableEq, Repr

/-- Who `next` leaves out of `prev`, in `prev`'s order. -/
def dropped (prev next : List Nat) : List Nat := prev.filter fun x => !next.contains x

/-- chatRosterRule(next, prev, linked, proven), with `signer` as `next.by`. -/
def allowed (next : RList) (signer : Nat) (prev : Option RList) (linked : Bool) (proven : List Nat) : Bool :=
  if !next.members.contains signer then false
  else if next.kind = .dm ∧ next.members.length ≠ 2 then false
  else if next.kind ≠ .channel ∧ next.managers ≠ next.members then false
  else if !linked then false
  else match prev with
    | none => next.managers.contains signer
    | some p =>
      if next.time ≤ p.time ∨ next.kind ≠ p.kind ∨ next.audience ≠ p.audience then false
      else if next.kind = .dm ∧ next.members ≠ p.members then false
      else if p.managers.contains signer then true
      else if !p.members.contains signer then false
      else if next.managers ≠ p.managers.filter (fun x => !(dropped p.members next.members).contains x) then false
      else if next.audience ≠ .team ∧ next.members.any (fun x => !p.members.contains x) then false
      else (dropped p.members next.members).all fun x => proven.contains x

/-- What `allowed` asks of a list that follows another, spelled out. -/
theorem of_allowed {n p : RList} {s : Nat} {l : Bool} {pr : List Nat}
    (h : allowed n s (some p) l pr = true) :
    s ∈ n.members ∧ (¬n.kind = .dm ∨ n.members.length = 2) ∧ (n.kind = .channel ∨ n.managers = n.members) ∧
      l = true ∧ (p.time < n.time ∧ n.kind = p.kind ∧ n.audience = p.audience) ∧
      (¬n.kind = .dm ∨ n.members = p.members) ∧
      (s ∈ p.managers ∨ s ∈ p.members ∧
        n.managers = p.managers.filter (fun x => !decide (x ∈ dropped p.members n.members)) ∧
        (n.audience = .team ∨ ∀ x, x ∈ n.members → x ∈ p.members) ∧
        ∀ x, x ∈ dropped p.members n.members → x ∈ pr) := by
  simpa [allowed, List.any_eq_true, List.all_eq_true] using h

/-- Whoever signs a list is on it. -/
theorem signer_in {n : RList} {s : Nat} {p : Option RList} {l : Bool} {pr : List Nat}
    (h : allowed n s p l pr = true) : s ∈ n.members := by
  cases p with
  | none => simp [allowed] at h; exact h.1
  | some p => exact (of_allowed h).1

/-- A conversation's first list is signed by someone it names as a manager, and names no list
before it. -/
theorem first_by_manager {n : RList} {s : Nat} {l : Bool} {pr : List Nat}
    (h : allowed n s none l pr = true) : s ∈ n.managers ∧ l = true := by
  simp [allowed] at h
  exact ⟨h.2.2.2.2, h.2.2.2.1⟩

/-- Every list is newer than the one it follows, so an old departure can't be replayed against
a later stay, and the kind of conversation and who it's for stay as they were. -/
theorem later {n p : RList} {s : Nat} {l : Bool} {pr : List Nat}
    (h : allowed n s (some p) l pr = true) : p.time < n.time ∧ n.kind = p.kind ∧ n.audience = p.audience :=
  (of_allowed h).2.2.2.2.1

/-- A direct message keeps its two people for good. -/
theorem dm_fixed {n p : RList} {s : Nat} {l : Bool} {pr : List Nat}
    (h : allowed n s (some p) l pr = true) (hk : n.kind = .dm) : n.members = p.members := by
  rcases (of_allowed h).2.2.2.2.2.1 with h1 | h1
  · exact absurd hk h1
  · exact h1

/-- Someone who isn't in the conversation can't sign its next list. -/
theorem outsider_refused {n p : RList} {s : Nat} {l : Bool} {pr : List Nat}
    (hm : s ∉ p.members) (hg : s ∉ p.managers) : allowed n s (some p) l pr = false := by
  cases h : allowed n s (some p) l pr
  · rfl
  · rcases (of_allowed h).2.2.2.2.2.2 with h1 | h1
    · exact absurd h1 hg
    · exact absurd h1.1 hm

/-- The checks after the manager test, for a signer who doesn't manage the conversation. -/
theorem member_rules {n p : RList} {s : Nat} {l : Bool} {pr : List Nat}
    (h : allowed n s (some p) l pr = true) (hs : s ∉ p.managers) :
    n.managers = p.managers.filter (fun x => !decide (x ∈ dropped p.members n.members)) ∧
    (n.audience = .team ∨ ∀ x, x ∈ n.members → x ∈ p.members) ∧
    ∀ x, x ∈ dropped p.members n.members → x ∈ pr := by
  rcases (of_allowed h).2.2.2.2.2.2 with h1 | h1
  · exact absurd h1 hs
  · exact h1.2

/-- Someone who doesn't manage the conversation can leave a person out only when that person's
departure is proven. -/
theorem drop_needs_proof {n p : RList} {s x : Nat} {l : Bool} {pr : List Nat}
    (h : allowed n s (some p) l pr = true) (hs : s ∉ p.managers)
    (hx : x ∈ p.members) (gone : x ∉ n.members) : x ∈ pr :=
  (member_rules h hs).2.2 x (by simp [dropped, List.mem_filter, hx, gone])

/-- Nobody comes into a conversation for some people unless a manager brings them in. -/
theorem no_private_add {n p : RList} {s : Nat} {l : Bool} {pr : List Nat}
    (h : allowed n s (some p) l pr = true) (hs : s ∉ p.managers) (ha : n.audience = .people) :
    ∀ x, x ∈ n.members → x ∈ p.members := by
  rcases (member_rules h hs).2.1 with h1 | h1
  · rw [ha] at h1; cases h1
  · exact h1

/-- Someone who doesn't manage the conversation can't make themselves, or anyone, a manager. -/
theorem managers_kept {n p : RList} {s x : Nat} {l : Bool} {pr : List Nat}
    (h : allowed n s (some p) l pr = true) (hs : s ∉ p.managers) (hx : x ∈ n.managers) :
    x ∈ p.managers := by
  rw [(member_rules h hs).1] at hx
  exact (List.mem_filter.1 hx).1

/-- One checked step of a conversation's history: the list, who signed it, whether it named the
list before, and who it proved gone. -/
structure Step where
  list : RList
  signer : Nat
  linked : Bool
  proven : List Nat

/-- A history every browser accepts, from a list it already checked. -/
def chainOk : RList → List Step → Bool
  | _, [] => true
  | prev, st :: rest => allowed st.list st.signer (some prev) st.linked st.proven && chainOk st.list rest

def last : RList → List Step → RList
  | prev, [] => prev
  | _, st :: rest => last st.list rest

/-- Along a history, `x` was never left out by a manager and never proven gone. -/
def keptBy (x : Nat) : RList → List Step → Prop
  | _, [] => True
  | prev, st :: rest => st.signer ∉ prev.managers ∧ x ∉ st.proven ∧ keptBy x st.list rest

/-- However long the history, someone in a conversation is still in it at the end unless a
manager left them out or their own or an admin's signed departure was proven. -/
theorem member_stays (x : Nat) : ∀ (p : RList) (steps : List Step),
    chainOk p steps = true → x ∈ p.members → keptBy x p steps → x ∈ (last p steps).members
  | p, [], _, hx, _ => hx
  | p, st :: rest, hok, hx, ⟨hs, hpr, hk⟩ => by
    simp only [chainOk, Bool.and_eq_true] at hok
    have : x ∈ st.list.members := by
      cases Classical.em (x ∈ st.list.members) with
      | inl h => exact h
      | inr gone => exact absurd (drop_needs_proof hok.1 hs hx gone) hpr
    exact member_stays x st.list rest hok.2 this hk

/-- Time only moves forward along a history. -/
theorem time_increases : ∀ (p : RList) (st : Step) (rest : List Step),
    chainOk p (st :: rest) = true → p.time < (last p (st :: rest)).time
  | p, st, [], hok => by
    simp only [chainOk, Bool.and_eq_true] at hok
    exact (later hok.1).1
  | p, st, st' :: rest, hok => by
    simp only [chainOk, Bool.and_eq_true] at hok
    have h1 := (later hok.1).1
    have h2 := time_increases st.list st' rest (by simp only [chainOk, Bool.and_eq_true]; exact hok.2)
    simp only [last] at h2 ⊢
    omega

/-- The kind of conversation and who it's for never change along a history. -/
theorem shape_fixed : ∀ (p : RList) (steps : List Step), chainOk p steps = true →
    (last p steps).kind = p.kind ∧ (last p steps).audience = p.audience
  | p, [], _ => ⟨rfl, rfl⟩
  | p, st :: rest, hok => by
    simp only [chainOk, Bool.and_eq_true] at hok
    have h := later hok.1
    have ih := shape_fixed st.list rest hok.2
    simp only [last]
    exact ⟨ih.1.trans h.2.1, ih.2.trans h.2.2⟩

end Nil.ChatRoster
