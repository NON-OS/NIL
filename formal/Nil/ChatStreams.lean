/-!
How a browser notices that the server held back, replayed or reordered chat messages
(client/src/actions/chat/chatStreams.ts). Each sending tab numbers what it sends in a timeline
1, 2, 3… under a stream of its own and signs the number; `seq` is the order the server put the
messages in. Within one sender's stream, sorted by `seq`, a number lower than the one before is a
reordering; sorted by number, two messages with one number and different ids are a replay and a
jump between two messages set to disappear alike is messages held back. A tab's signed
high-water mark ahead of every number delivered is messages held back at the end.

The model follows the code, sorting included, and the tests replay the code against it. The
theorems below hold for any order and any duplicates the server might choose.
-/

namespace Nil.ChatStreams

structure Item where
  seq : Nat
  n : Nat
  id : Nat
  sender : Nat
  stream : Nat
  ttl : Option Nat
  deriving DecidableEq, Repr

/-! ### Sorting, as the code's `sort` does it -/

def insertBy {α : Type} (le : α → α → Bool) (x : α) : List α → List α
  | [] => [x]
  | y :: ys => if le x y then x :: y :: ys else y :: insertBy le x ys

def sortBy {α : Type} (le : α → α → Bool) : List α → List α
  | [] => []
  | x :: xs => insertBy le x (sortBy le xs)

def bySeqLe (a b : Item) : Bool := a.seq ≤ b.seq
def byNLe (a b : Item) : Bool := a.n < b.n || (a.n = b.n && a.seq ≤ b.seq)

def pairs {α : Type} : List α → List (α × α)
  | a :: b :: rest => (a, b) :: pairs (b :: rest)
  | _ => []

/-! ### One stream -/

/-- What one pair of neighbours, in number order, says: (replayed, missing). -/
def pairNote (a b : Item) : Nat × Nat :=
  if a.n = b.n ∧ a.id ≠ b.id then (1, 0)
  else if a.n + 1 < b.n ∧ a.ttl = b.ttl then (0, b.n - a.n - 1)
  else (0, 0)

def reordered (es : List Item) : Nat :=
  if (pairs (sortBy bySeqLe es)).any (fun p => p.2.n < p.1.n) then 1 else 0

def replayed (es : List Item) : Nat := ((pairs (sortBy byNLe es)).map fun p => (pairNote p.1 p.2).1).sum

def gaps (es : List Item) : Nat := ((pairs (sortBy byNLe es)).map fun p => (pairNote p.1 p.2).2).sum

/-- Missing at the start, when the timeline reaches back to its first message. -/
def atStart (es : List Item) (fromStart : Bool) : Nat :=
  match sortBy byNLe es with
  | h :: _ => if fromStart ∧ 1 < h.n ∧ es.all (fun e => e.ttl = none) then h.n - 1 else 0
  | [] => 0

def highest (es : List Item) : Nat := es.foldl (fun m e => max m e.n) 0

/-- What a mark of `n`, valid until `expiry` if it disappears, says at time `now`. -/
def markMissing (es : List Item) (fromStart : Bool) (n : Nat) (expiry : Option Nat) (now : Nat) : Nat :=
  if (match expiry with | some u => decide (u ≤ now) | none => false) then 0
  else if es = [] ∧ fromStart = false then 0
  else if highest es < n then n - highest es else 0

/-! ### Every stream of a timeline, as the code reports it -/

structure Mark where
  sender : Nat
  stream : Nat
  n : Nat
  expiry : Option Nat
  deriving DecidableEq, Repr

/-- 0 missing, 1 replayed, 2 reordered. -/
abbrev Notice := Nat × Nat × Nat

def keys (items : List Item) : List (Nat × Nat) :=
  items.foldl (fun ks i => if ks.contains (i.sender, i.stream) then ks else ks ++ [(i.sender, i.stream)]) []

def streamOf (items : List Item) (k : Nat × Nat) : List Item := items.filter fun i => (i.sender, i.stream) = k

/-- Every (kind, sender, count) the streams and marks raise, before adding up. -/
def raised (items : List Item) (fromStart : Bool) (marks : List Mark) (now : Nat) : List Notice :=
  let fromStreams := (keys items).flatMap fun k =>
    let es := streamOf items k
    [(2, k.1, reordered es), (1, k.1, replayed es), (0, k.1, gaps es + atStart es fromStart)]
  let fromMarks := marks.map fun m => (0, m.sender, markMissing (streamOf items (m.sender, m.stream)) fromStart m.n m.expiry now)
  fromStreams ++ fromMarks

/-- Added up per kind and sender, leaving out zeros, in (kind, sender) order. -/
def notices (items : List Item) (fromStart : Bool) (marks : List Mark) (now : Nat) : List Notice :=
  let all := raised items fromStart marks now
  let who := sortBy (fun a b => a.1 < b.1 || (a.1 = b.1 && a.2 ≤ b.2))
    (all.foldl (fun ks x => if ks.contains (x.1, x.2.1) then ks else ks ++ [(x.1, x.2.1)]) [])
  who.filterMap fun (kind, sender) =>
    let total := ((all.filter fun x => x.1 = kind ∧ x.2.1 = sender).map fun x => x.2.2).sum
    if total = 0 then none else some (kind, sender, total)

/-! ### Facts about sorting -/

/-- Neighbours in the list are related by `r`. -/
def Adj {α : Type} (r : α → α → Prop) : List α → Prop
  | a :: b :: rest => r a b ∧ Adj r (b :: rest)
  | _ => True

theorem mem_insertBy {α : Type} (le : α → α → Bool) (x z : α) :
    ∀ l : List α, z ∈ insertBy le x l ↔ z = x ∨ z ∈ l
  | [] => by simp [insertBy]
  | y :: ys => by
    unfold insertBy
    split
    · simp
    · simp only [List.mem_cons, mem_insertBy le x z ys]
      constructor
      · rintro (h | h | h) <;> simp [h]
      · rintro (h | h | h) <;> simp [h]

theorem mem_sortBy {α : Type} (le : α → α → Bool) (z : α) : ∀ l : List α, z ∈ sortBy le l ↔ z ∈ l
  | [] => by simp [sortBy]
  | x :: xs => by simp [sortBy, mem_insertBy, mem_sortBy le z xs]

theorem insertBy_head {α : Type} (le : α → α → Bool) (x : α) :
    ∀ l : List α, ∃ h t, insertBy le x l = h :: t ∧ (h = x ∨ ∃ t', l = h :: t')
  | [] => ⟨x, [], rfl, Or.inl rfl⟩
  | y :: ys => by
    unfold insertBy
    split
    · exact ⟨x, y :: ys, rfl, Or.inl rfl⟩
    · exact ⟨y, insertBy le x ys, rfl, Or.inr ⟨ys, rfl⟩⟩

/-- Inserting into a sorted list keeps it sorted, for a comparison that orders any two. -/
theorem adj_insertBy {α : Type} (le : α → α → Bool) (total : ∀ a b, le a b = false → le b a = true)
    (x : α) : ∀ l : List α, Adj (fun a b => le a b = true) l → Adj (fun a b => le a b = true) (insertBy le x l)
  | [], _ => trivial
  | [y], _ => by
    unfold insertBy
    split
    · rename_i h; exact ⟨h, trivial⟩
    · rename_i h
      simp only [Bool.not_eq_true] at h
      exact ⟨total _ _ h, trivial⟩
  | y :: z :: zs, hs => by
    unfold insertBy
    split
    · rename_i h; exact ⟨h, hs⟩
    · rename_i h
      simp only [Bool.not_eq_true] at h
      have ih := adj_insertBy le total x (z :: zs) hs.2
      obtain ⟨hd, tl, heq, hcase⟩ := insertBy_head le x (z :: zs)
      rw [heq] at ih ⊢
      refine ⟨?_, ih⟩
      rcases hcase with rfl | ⟨t', ht⟩
      · exact total _ _ h
      · cases ht; exact hs.1

theorem adj_sortBy {α : Type} (le : α → α → Bool) (total : ∀ a b, le a b = false → le b a = true) :
    ∀ l : List α, Adj (fun a b => le a b = true) (sortBy le l)
  | [] => trivial
  | x :: xs => adj_insertBy le total x _ (adj_sortBy le total xs)

theorem byNLe_total (a b : Item) : byNLe a b = false → byNLe b a = true := by
  simp only [byNLe, Bool.or_eq_false_iff, Bool.and_eq_false_imp, decide_eq_false_iff_not,
    Bool.or_eq_true, decide_eq_true_eq, Bool.and_eq_true]
  intro ⟨h1, h2⟩
  by_cases e : a.n = b.n
  · exact Or.inr ⟨e.symm, by have := h2 e; omega⟩
  · exact Or.inl (by omega)

theorem bySeqLe_total (a b : Item) : bySeqLe a b = false → bySeqLe b a = true := by
  simp only [bySeqLe, decide_eq_false_iff_not, decide_eq_true_eq]; omega

/-- In a list whose neighbours are related by a transitive `r`, the head is related to all. -/
theorem adj_head {α : Type} (r : α → α → Prop) (trans : ∀ a b c, r a b → r b c → r a c) :
    ∀ (h : α) (t : List α), Adj r (h :: t) → ∀ z ∈ t, r h z
  | h, [], _, z, hz => by simp at hz
  | h, b :: rest, hs, z, hz => by
    rcases List.mem_cons.1 hz with rfl | hz
    · exact hs.1
    · exact trans _ _ _ hs.1 (adj_head r trans b rest hs.2 z hz)

theorem adj_tail {α : Type} (r : α → α → Prop) : ∀ (h : α) (t : List α), Adj r (h :: t) → Adj r t
  | _, [], _ => trivial
  | _, _ :: _, hs => hs.2

def nLe (a b : Item) : Prop := a.n ≤ b.n

theorem adj_byN_nLe : ∀ l : List Item, Adj (fun a b => byNLe a b = true) l → Adj nLe l
  | [], _ => trivial
  | [_], _ => trivial
  | a :: b :: rest, hs => by
    refine ⟨?_, adj_byN_nLe (b :: rest) hs.2⟩
    have := hs.1
    simp only [byNLe, Bool.or_eq_true, decide_eq_true_eq, Bool.and_eq_true] at this
    unfold nLe; omega

theorem sum_ge {l : List Nat} {x : Nat} (h : x ∈ l) : x ≤ l.sum := by
  induction l with
  | nil => simp at h
  | cons y ys ih =>
    simp only [List.sum_cons]
    rcases List.mem_cons.1 h with rfl | h
    · omega
    · have := ih h; omega

theorem pairs_mem {α : Type} : ∀ (l : List α) (p : α × α), p ∈ pairs l → p.1 ∈ l ∧ p.2 ∈ l
  | [], _, h => by simp [pairs] at h
  | [_], _, h => by simp [pairs] at h
  | a :: b :: rest, p, h => by
    simp only [pairs, List.mem_cons] at h
    rcases h with rfl | h
    · simp
    · have := pairs_mem (b :: rest) p h
      exact ⟨List.mem_cons_of_mem _ this.1, List.mem_cons_of_mem _ this.2⟩

/-! ### What is caught -/

/-- In a list sorted by number, a number between two present ones that is itself absent sits
between some pair of neighbours. -/
theorem gap_between : ∀ (l : List Item) (v : Nat), Adj nLe l →
    (∃ x ∈ l, x.n < v) → (∃ y ∈ l, v < y.n) → (∀ z ∈ l, z.n ≠ v) →
    ∃ p ∈ pairs l, p.1.n < v ∧ v < p.2.n
  | [], _, _, ⟨x, hx, _⟩, _, _ => by simp at hx
  | [a], v, _, ⟨x, hx, hxv⟩, ⟨y, hy, hyv⟩, _ => by
    simp at hx hy; subst hx; subst hy; omega
  | a :: b :: rest, v, hs, ⟨x, hx, hxv⟩, ⟨y, hy, hyv⟩, hz => by
    have hav : a.n < v := by
      rcases List.mem_cons.1 hx with rfl | hx
      · exact hxv
      · have := adj_head nLe (fun _ _ _ h1 h2 => Nat.le_trans h1 h2) a (b :: rest) hs x hx
        unfold nLe at this; omega
    by_cases hb : v < b.n
    · exact ⟨(a, b), by simp [pairs], hav, hb⟩
    · have hbv : b.n < v := by
        have := hz b (by simp); omega
      obtain ⟨p, hp, h1, h2⟩ := gap_between (b :: rest) v hs.2 ⟨b, by simp, hbv⟩
        ⟨y, by
          rcases List.mem_cons.1 hy with rfl | hy
          · exact absurd hyv (by omega)
          · exact hy, hyv⟩
        (fun z hz' => hz z (List.mem_cons_of_mem _ hz'))
      exact ⟨p, by simp [pairs, hp], h1, h2⟩

/-- A message held back between two that arrived is reported as missing, whatever order the
server delivered them in and however many it sent twice, when the stream's messages are set to
disappear alike. -/
theorem held_back_reported (es : List Item) (v : Nat) (ttl : Option Nat)
    (alike : ∀ e ∈ es, e.ttl = ttl)
    (below : ∃ x ∈ es, x.n < v) (above : ∃ y ∈ es, v < y.n) (absent : ∀ z ∈ es, z.n ≠ v) :
    0 < gaps es := by
  have sorted := adj_byN_nLe _ (adj_sortBy byNLe byNLe_total es)
  have mem := fun z => mem_sortBy byNLe z es
  obtain ⟨x, hx, hxv⟩ := below
  obtain ⟨y, hy, hyv⟩ := above
  obtain ⟨p, hp, h1, h2⟩ := gap_between (sortBy byNLe es) v sorted ⟨x, (mem x).2 hx, hxv⟩
    ⟨y, (mem y).2 hy, hyv⟩ (fun z hz => absent z ((mem z).1 hz))
  have ⟨hp1, hp2⟩ := pairs_mem _ p hp
  have t1 := alike p.1 ((mem p.1).1 hp1)
  have t2 := alike p.2 ((mem p.2).1 hp2)
  have note : pairNote p.1 p.2 = (0, p.2.n - p.1.n - 1) := by
    unfold pairNote
    rw [if_neg (by omega), if_pos ⟨by omega, by rw [t1, t2]⟩]
  have big : p.2.n - p.1.n - 1 ∈ (pairs (sortBy byNLe es)).map fun p => (pairNote p.1 p.2).2 :=
    List.mem_map.2 ⟨p, hp, by rw [note]⟩
  have := sum_ge big
  unfold gaps
  omega

theorem adj_of_pairs {α : Type} (r : α → α → Prop) : ∀ l : List α, (∀ p ∈ pairs l, r p.1 p.2) → Adj r l
  | [], _ => trivial
  | [_], _ => trivial
  | a :: b :: rest, h => ⟨h (a, b) (by simp [pairs]), adj_of_pairs r (b :: rest) fun p hp => h p (by simp [pairs, hp])⟩

theorem pairs_of_adj {α : Type} (r : α → α → Prop) : ∀ l : List α, Adj r l → ∀ p ∈ pairs l, r p.1 p.2
  | [], _, p, hp => by simp [pairs] at hp
  | [_], _, p, hp => by simp [pairs] at hp
  | a :: b :: rest, h, p, hp => by
    simp only [pairs, List.mem_cons] at hp
    rcases hp with rfl | hp
    · exact h.1
    · exact pairs_of_adj r (b :: rest) h.2 p hp

/-- In a list sorted by number, if neighbours with one number always share an id, then any two
messages with one number share it. -/
theorem same_n_same_id : ∀ l : List Item, Adj nLe l →
    (∀ p ∈ pairs l, p.1.n = p.2.n → p.1.id = p.2.id) → ∀ a ∈ l, ∀ b ∈ l, a.n = b.n → a.id = b.id
  | [], _, _, a, ha, _, _, _ => by simp at ha
  | [h], _, _, a, ha, b, hb, _ => by simp at ha hb; rw [ha, hb]
  | h :: h2 :: t, hs, hp, a, ha, b, hb, hab => by
    have tailP : ∀ p ∈ pairs (h2 :: t), p.1.n = p.2.n → p.1.id = p.2.id := fun p hq => hp p (by simp [pairs, hq])
    have ih := same_n_same_id (h2 :: t) hs.2 tailP
    have trans : ∀ a b c : Item, nLe a b → nLe b c → nLe a c := fun _ _ _ h1 h2 => Nat.le_trans h1 h2
    -- the head and anything after it with its number: the neighbour has that number too
    have headCase : ∀ c ∈ h2 :: t, h.n = c.n → h.id = c.id := by
      intro c hc hn
      have h1 : h.n ≤ h2.n := hs.1
      have h2c : h2.n ≤ c.n := by
        rcases List.mem_cons.1 hc with rfl | hc
        · exact Nat.le_refl _
        · exact adj_head nLe trans h2 t hs.2 c hc
      have e : h.n = h2.n := by omega
      have := hp (h, h2) (by simp [pairs]) e
      rw [this]
      exact ih h2 (by simp) c hc (by omega)
    rcases List.mem_cons.1 ha with ea | ha' <;> rcases List.mem_cons.1 hb with eb | hb'
    · rw [ea, eb]
    · rw [ea]; exact headCase b hb' (by rw [← ea]; exact hab)
    · rw [eb]; exact (headCase a ha' (by rw [← eb]; exact hab.symm)).symm
    · exact ih a ha' b hb' hab

/-- One number under two ids is reported as a replay, whatever order the server used. -/
theorem replay_reported (es : List Item) (x y : Item) (hx : x ∈ es) (hy : y ∈ es)
    (hn : x.n = y.n) (hid : x.id ≠ y.id) : 0 < replayed es := by
  have sorted := adj_byN_nLe _ (adj_sortBy byNLe byNLe_total es)
  have mem := fun z => mem_sortBy byNLe z es
  cases Classical.em (∃ p ∈ pairs (sortBy byNLe es), p.1.n = p.2.n ∧ p.1.id ≠ p.2.id) with
  | inl h =>
    obtain ⟨p, hp, e, d⟩ := h
    have note : (pairNote p.1 p.2).1 = 1 := by unfold pairNote; rw [if_pos ⟨e, d⟩]
    have := sum_ge (List.mem_map.2 ⟨p, hp, note⟩ : 1 ∈ (pairs (sortBy byNLe es)).map fun p => (pairNote p.1 p.2).1)
    unfold replayed; omega
  | inr h =>
    have := same_n_same_id _ sorted (fun p hp e => by
      cases Classical.em (p.1.id = p.2.id) with
      | inl q => exact q
      | inr q => exact absurd ⟨p, hp, e, q⟩ h) x ((mem x).2 hx) y ((mem y).2 hy) hn
    exact absurd this hid

def seqLe (a b : Item) : Prop := a.seq ≤ b.seq

/-- In a list sorted by the server's order whose numbers never go down between neighbours, a
message the server put first never has the higher number. -/
theorem in_order : ∀ l : List Item, Adj seqLe l → Adj nLe l →
    ∀ a ∈ l, ∀ b ∈ l, a.seq < b.seq → a.n ≤ b.n
  | [], _, _, a, ha, _, _, _ => by simp at ha
  | h :: t, hs, hn, a, ha, b, hb, hab => by
    have tr : ∀ a b c : Item, a.seq ≤ b.seq → b.seq ≤ c.seq → a.seq ≤ c.seq := fun _ _ _ h1 h2 => Nat.le_trans h1 h2
    have trn : ∀ a b c : Item, nLe a b → nLe b c → nLe a c := fun _ _ _ h1 h2 => Nat.le_trans h1 h2
    rcases List.mem_cons.1 ha with ea | ha' <;> rcases List.mem_cons.1 hb with eb | hb'
    · rw [ea, eb] at hab; omega
    · rw [ea]; exact adj_head nLe trn h t hn b hb'
    · have := adj_head seqLe tr h t hs a ha'; unfold seqLe at this; rw [eb] at hab; omega
    · exact in_order t (adj_tail seqLe h t hs) (adj_tail nLe h t hn) a ha' b hb' hab

/-- A message the server put after another with a lower number is reported as a reordering. -/
theorem reorder_reported (es : List Item) (x y : Item) (hx : x ∈ es) (hy : y ∈ es)
    (hseq : x.seq < y.seq) (hn : y.n < x.n) : reordered es = 1 := by
  have sorted : Adj seqLe (sortBy bySeqLe es) := by
    have := adj_sortBy bySeqLe bySeqLe_total es
    exact adj_of_pairs seqLe _ fun p hp => by
      have := pairs_of_adj _ _ this p hp
      simp only [bySeqLe, decide_eq_true_eq] at this; exact this
  have mem := fun z => mem_sortBy bySeqLe z es
  unfold reordered
  split
  · rfl
  · rename_i h
    simp only [List.any_eq_true, decide_eq_true_eq, not_exists, not_and, Nat.not_lt] at h
    have mono := in_order _ sorted (adj_of_pairs nLe _ fun p hp => h p hp) x ((mem x).2 hx) y ((mem y).2 hy) hseq
    omega

theorem foldl_max_lt (n : Nat) : ∀ (l : List Item) (acc : Nat), acc < n → (∀ e ∈ l, e.n < n) →
    l.foldl (fun m e => max m e.n) acc < n
  | [], _, h, _ => h
  | e :: rest, acc, h, he => by
    simp only [List.foldl_cons]
    exact foldl_max_lt n rest _ (by have := he e (by simp); omega) fun z hz => he z (List.mem_cons_of_mem _ hz)

/-- A tab's mark ahead of every number the server delivered from it is reported as messages
held back at the end, as long as the mark hasn't expired and there's something to compare it
with: a message from that tab, or a timeline that reaches back to the start. -/
theorem tail_reported (es : List Item) (fromStart : Bool) (n : Nat) (expiry : Option Nat) (now : Nat)
    (ahead : ∀ e ∈ es, e.n < n) (pos : 0 < n) (seen : es ≠ [] ∨ fromStart = true)
    (live : ∀ u, expiry = some u → now < u) : 0 < markMissing es fromStart n expiry now := by
  have hh : highest es < n := foldl_max_lt n es 0 pos ahead
  unfold markMissing
  rw [if_neg, if_neg, if_pos hh]
  · omega
  · rintro ⟨h1, h2⟩
    rcases seen with h | h
    · exact h h1
    · rw [h] at h2; cases h2
  · cases hex : expiry with
    | none => simp
    | some u => have := live u hex; simp; omega

theorem sum_zero : ∀ l : List Nat, (∀ x ∈ l, x = 0) → l.sum = 0
  | [], _ => rfl
  | x :: xs, h => by
    simp only [List.sum_cons]
    rw [h x (by simp), sum_zero xs fun z hz => h z (List.mem_cons_of_mem _ hz)]

/-! ### An honest server -/

def item (a : Nat) : Item := ⟨a, a, a, 0, 0, none⟩

/-- A tab's messages a to a + k − 1, delivered in order. -/
def honestFrom : Nat → Nat → List Item
  | _, 0 => []
  | a, k + 1 => item a :: honestFrom (a + 1) k

theorem honest_pairs : ∀ (a k : Nat) (p : Item × Item), p ∈ pairs (honestFrom a k) →
    p.2.n = p.1.n + 1 ∧ p.2.seq = p.1.seq + 1 ∧ p.1.ttl = none ∧ p.2.ttl = none
  | _, 0, p, hp => by simp [honestFrom, pairs] at hp
  | _, 1, p, hp => by simp [honestFrom, pairs] at hp
  | a, k + 2, p, hp => by
    simp only [honestFrom, pairs, List.mem_cons] at hp
    rcases hp with rfl | hp
    · simp [item]
    · exact honest_pairs (a + 1) (k + 1) p (by simpa [honestFrom] using hp)

theorem honest_head : ∀ (a k : Nat), 0 < k → ∃ t, honestFrom a k = item a :: t
  | _, 0, h => absurd h (by omega)
  | a, k + 1, _ => ⟨_, rfl⟩

theorem sortBy_sorted {α : Type} (le : α → α → Bool) : ∀ l : List α, Adj (fun a b => le a b = true) l → sortBy le l = l
  | [], _ => rfl
  | [x], _ => rfl
  | x :: y :: rest, h => by
    have ih := sortBy_sorted le (y :: rest) h.2
    simp only [sortBy] at ih ⊢
    rw [ih]
    unfold insertBy
    rw [if_pos h.1]

theorem mem_honest : ∀ (a k : Nat) (e : Item), e ∈ honestFrom a k → a ≤ e.n ∧ e.n < a + k
  | _, 0, e, h => by simp [honestFrom] at h
  | a, k + 1, e, h => by
    simp only [honestFrom, List.mem_cons] at h
    rcases h with rfl | h
    · simp [item]
    · have := mem_honest (a + 1) k e h; omega

theorem last_honest : ∀ (a k : Nat), item (a + k) ∈ honestFrom a (k + 1)
  | a, 0 => by simp [honestFrom]
  | a, k + 1 => by
    have := last_honest (a + 1) k
    simp only [honestFrom] at this ⊢
    exact List.mem_cons_of_mem _ (by rw [show a + (k + 1) = a + 1 + k by omega]; exact this)

theorem le_foldl_max : ∀ (l : List Item) (acc : Nat) (e : Item), e ∈ l → e.n ≤ l.foldl (fun m e => max m e.n) acc
  | [], _, _, h => by simp at h
  | x :: rest, acc, e, h => by
    simp only [List.foldl_cons]
    have mono : ∀ (l : List Item) (b : Nat), b ≤ l.foldl (fun m e => max m e.n) b := by
      intro l; induction l with
      | nil => intro b; exact Nat.le_refl _
      | cons z zs ih => intro b; simp only [List.foldl_cons]; exact Nat.le_trans (Nat.le_max_left _ _) (ih _)
    rcases List.mem_cons.1 h with rfl | h
    · exact Nat.le_trans (Nat.le_max_right _ _) (mono rest _)
    · exact le_foldl_max rest _ e h

/-- A server that delivers a tab's messages 1 to k in order, each once, raises nothing, from the
start of the timeline on, and nor does that tab's mark of anything up to k. -/
theorem honest_silent (k m now : Nat) (expiry : Option Nat) (hm : m ≤ k) :
    let es := honestFrom 1 k
    reordered es = 0 ∧ replayed es = 0 ∧ gaps es = 0 ∧ atStart es true = 0 ∧
      markMissing es true m expiry now = 0 := by
  intro es
  have hp := honest_pairs 1 k
  have bySeq : sortBy bySeqLe es = es :=
    sortBy_sorted _ _ (adj_of_pairs _ _ fun p q => by
      have := hp p q; simp only [bySeqLe, decide_eq_true_eq]; omega)
  have byN : sortBy byNLe es = es :=
    sortBy_sorted _ _ (adj_of_pairs _ _ fun p q => by
      have := hp p q; simp only [byNLe, Bool.or_eq_true, decide_eq_true_eq, Bool.and_eq_true]; omega)
  have quiet : ∀ p ∈ pairs es, pairNote p.1 p.2 = (0, 0) := by
    intro p q
    have := hp p q
    unfold pairNote
    rw [if_neg (by omega), if_neg (by omega)]
  have zeros : ∀ (f : Nat × Nat → Nat), f (0, 0) = 0 → ((pairs es).map fun p => f (pairNote p.1 p.2)).sum = 0 := by
    intro f hf
    apply sum_zero
    intro x hx
    obtain ⟨p, q, rfl⟩ := List.mem_map.1 hx
    rw [quiet p q, hf]
  refine ⟨?_, ?_, ?_, ?_, ?_⟩
  · unfold reordered; rw [bySeq, if_neg]
    simp only [List.any_eq_true, decide_eq_true_eq, not_exists, not_and, Nat.not_lt]
    intro p q; have := hp p q; omega
  · unfold replayed; rw [byN]; exact zeros Prod.fst rfl
  · unfold gaps; rw [byN]; exact zeros Prod.snd rfl
  · unfold atStart; rw [byN]
    cases k with
    | zero => rfl
    | succ k =>
      obtain ⟨t, ht⟩ := honest_head 1 (k + 1) (by omega)
      show (match honestFrom 1 (k + 1) with | h :: _ => _ | [] => 0) = 0
      rw [ht]; simp [item]
  · have top : m ≤ highest es := by
      cases k with
      | zero => omega
      | succ k =>
        have := le_foldl_max (honestFrom 1 (k + 1)) 0 (item (1 + k)) (last_honest 1 k)
        simp only [item] at this
        show m ≤ (honestFrom 1 (k + 1)).foldl (fun m e => max m e.n) 0
        omega
    have : ¬ highest es < m := by omega
    unfold markMissing
    simp [this]

end Nil.ChatStreams
