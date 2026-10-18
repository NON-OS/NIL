/-!
Cycle walking. Given an injective map F on [0, N) and a domain D inside it, keep applying F
until the value lands in D. This is how server/billing/permute.js turns a permutation of a power
of four into a permutation of 1 … 10^digits − 1. The walk here has fuel; `walk_total` shows N
steps always suffice, so it never runs out where the JavaScript loop would still be going.
-/

namespace Nil.Invoice

def iter (F : Nat → Nat) : Nat → Nat → Nat
  | 0, v => v
  | k + 1, v => iter F k (F v)

def walk (F : Nat → Nat) (D : Nat → Bool) : Nat → Nat → Option Nat
  | 0, _ => none
  | n + 1, v => if D (F v) then some (F v) else walk F D n (F v)

section

variable {F : Nat → Nat} {N : Nat}

theorem iter_succ' (k v : Nat) : iter F (k + 1) v = F (iter F k v) := by
  induction k generalizing v with
  | zero => rfl
  | succ k ih => simp only [iter] at *; rw [ih]

theorem iter_add (a b v : Nat) : iter F (a + b) v = iter F a (iter F b v) := by
  induction a with
  | zero => simp [iter]
  | succ a ih => rw [Nat.add_right_comm, iter_succ', iter_succ', ih]

theorem iter_lt (hF : ∀ v, v < N → F v < N) (k : Nat) : ∀ v, v < N → iter F k v < N := by
  induction k with
  | zero => intro v h; exact h
  | succ k ih => intro v h; exact ih _ (hF v h)

theorem iter_inj (hF : ∀ v, v < N → F v < N) (inj : ∀ a b, a < N → b < N → F a = F b → a = b)
    (k : Nat) : ∀ a b, a < N → b < N → iter F k a = iter F k b → a = b := by
  induction k with
  | zero => intro a b _ _ h; exact h
  | succ k ih => intro a b ha hb h; exact inj a b ha hb (ih _ _ (hF a ha) (hF b hb) h)

/-- The pigeonhole principle for N + 1 values below N. -/
theorem pigeonhole : ∀ (N : Nat) (g : Nat → Nat), (∀ i, i ≤ N → g i < N) →
    ∃ i j, i < j ∧ j ≤ N ∧ g i = g j := by
  intro N
  induction N with
  | zero => intro g h; exact absurd (h 0 (Nat.le_refl _)) (Nat.not_lt_zero _)
  | succ N ih =>
    intro g h
    by_cases hit : ∃ i, i ≤ N ∧ g i = g (N + 1)
    · obtain ⟨i, hi, e⟩ := hit
      exact ⟨i, N + 1, by omega, Nat.le_refl _, e⟩
    · have miss : ∀ i, i ≤ N → g i ≠ g (N + 1) := fun i hi e => hit ⟨i, hi, e⟩
      let g' := fun i => if g i = N then g (N + 1) else g i
      have hg' : ∀ i, i ≤ N → g' i < N := by
        intro i hi
        simp only [g']
        have := h i (by omega)
        have := h (N + 1) (Nat.le_refl _)
        have := miss i hi
        split
        · rcases Nat.lt_or_ge (g (N + 1)) N with h1 | h1
          · exact h1
          · omega
        · omega
      obtain ⟨i, j, hij, hj, e⟩ := ih g' hg'
      refine ⟨i, j, hij, by omega, ?_⟩
      simp only [g'] at e
      have mi := miss i (by omega)
      have mj := miss j hj
      split at e <;> split at e <;> first | omega | exact absurd e.symm mj | exact absurd e mi

/-- Every point of [0, N) comes back to itself within N steps. -/
theorem period (hF : ∀ v, v < N → F v < N) (inj : ∀ a b, a < N → b < N → F a = F b → a = b)
    (x : Nat) (hx : x < N) : ∃ p, 1 ≤ p ∧ p ≤ N ∧ iter F p x = x := by
  obtain ⟨i, j, hij, hj, e⟩ := pigeonhole N (fun i => iter F i x) (fun i _ => iter_lt hF i x hx)
  refine ⟨j - i, by omega, by omega, ?_⟩
  apply iter_inj hF inj i _ _ (iter_lt hF _ x hx) hx
  have e : iter F i x = iter F j x := e
  rw [← iter_add, Nat.add_sub_cancel' (Nat.le_of_lt hij)]; exact e.symm

/-- The least k ≥ 1 with a property, when there is one. -/
theorem least (P : Nat → Prop) (k : Nat) (hk : 1 ≤ k ∧ P k) :
    ∃ m, 1 ≤ m ∧ m ≤ k ∧ P m ∧ ∀ j, 1 ≤ j → j < m → ¬ P j := by
  induction k using Nat.strongRecOn with
  | _ k ih =>
    by_cases h : ∃ j, 1 ≤ j ∧ j < k ∧ P j
    · obtain ⟨j, h1, h2, h3⟩ := h
      obtain ⟨m, a, b, c, d⟩ := ih j h2 ⟨h1, h3⟩
      exact ⟨m, a, by omega, c, d⟩
    · exact ⟨k, hk.1, Nat.le_refl _, hk.2, fun j a b c => h ⟨j, a, b, c⟩⟩

variable {D : Nat → Bool}

theorem walk_some (n v w : Nat) (h : walk F D n v = some w) :
    ∃ k, 1 ≤ k ∧ k ≤ n ∧ iter F k v = w ∧ D w ∧ ∀ j, 1 ≤ j → j < k → D (iter F j v) = false := by
  induction n generalizing v with
  | zero => simp [walk] at h
  | succ n ih =>
    simp only [walk] at h
    split at h
    · cases h
      exact ⟨1, Nat.le_refl _, by omega, rfl, by assumption, fun j a b => by omega⟩
    · obtain ⟨k, h1, h2, h3, h4, h5⟩ := ih (F v) h
      refine ⟨k + 1, by omega, by omega, h3, h4, fun j a b => ?_⟩
      rcases Nat.lt_or_ge j 2 with hj | hj
      · have : j = 1 := by omega
        subst this; simpa [iter] using (by assumption : ¬ D (F v) = true)
      · have := h5 (j - 1) (by omega) (by omega)
        rwa [show j = (j - 1) + 1 by omega, iter]

theorem walk_found (n v k : Nat) (hk : 1 ≤ k ∧ k ≤ n) (hD : D (iter F k v)) :
    ∃ w, walk F D n v = some w := by
  induction n generalizing v k with
  | zero => omega
  | succ n ih =>
    simp only [walk]
    split
    · exact ⟨_, rfl⟩
    · rename_i hno
      rcases Nat.lt_or_ge k 2 with h | h
      · have : k = 1 := by omega
        subst this; exact absurd hD hno
      · apply ih (F v) (k - 1) (by omega)
        rwa [show k = (k - 1) + 1 by omega, iter] at hD

variable (hF : ∀ v, v < N → F v < N) (inj : ∀ a b, a < N → b < N → F a = F b → a = b)
  (hD : ∀ v, D v → v < N)
include hF inj hD

/-- Starting anywhere in the domain, N steps always reach the domain again. -/
theorem walk_total (x : Nat) (hx : D x) : ∃ w, walk F D N x = some w := by
  obtain ⟨p, h1, h2, h3⟩ := period hF inj x (hD x hx)
  exact walk_found N x p ⟨h1, h2⟩ (by rw [h3]; exact hx)

theorem walk_inj (x y w : Nat) (hx : D x) (hy : D y) (ex : walk F D N x = some w)
    (ey : walk F D N y = some w) : x = y := by
  obtain ⟨a, a1, -, a3, -, a5⟩ := walk_some N x w ex
  obtain ⟨b, b1, -, b3, -, b5⟩ := walk_some N y w ey
  have key : ∀ a b x y, 1 ≤ a → D x → D y → iter F a x = w → iter F b y = w →
      (∀ j, 1 ≤ j → j < b → D (iter F j y) = false) → a ≤ b → x = y := by
    intro a b x y ha1 hx hy ha hb hmin hab
    have : iter F a x = iter F a (iter F (b - a) y) := by
      rw [← iter_add, Nat.add_sub_cancel' hab, ha, hb]
    have e := iter_inj hF inj a _ _ (hD x hx) (iter_lt hF _ y (hD y hy)) this
    rcases Nat.eq_or_lt_of_le hab with h | h
    · subst h; simpa [iter] using e
    · have := hmin (b - a) (by omega) (by omega)
      rw [← e] at this; simp [hx] at this
  rcases Nat.le_total a b with h | h
  · exact key a b x y a1 hx hy a3 b3 b5 h
  · exact (key b a y x b1 hy hx b3 a3 a5 h).symm

theorem walk_onto (z : Nat) (hz : D z) : ∃ x, D x ∧ walk F D N x = some z := by
  obtain ⟨p, p1, p2, p3⟩ := period hF inj z (hD z hz)
  -- step back from z to the nearest earlier point of its cycle that lies in D
  obtain ⟨j, j1, j2, j3, j4⟩ := least (fun j => D (iter F (p - j) z) = true) p
    ⟨p1, by simpa [iter] using hz⟩
  refine ⟨iter F (p - j) z, j3, ?_⟩
  have hw : ∀ i, iter F i (iter F (p - j) z) = iter F (p - j + i) z := by
    intro i; rw [← iter_add, Nat.add_comm]
  obtain ⟨w, hw'⟩ := walk_found (D := D) N (iter F (p - j) z) j ⟨j1, by omega⟩
    (by rw [hw, show p - j + j = p by omega, p3]; exact hz)
  obtain ⟨k, k1, -, k3, k4, k5⟩ := walk_some N _ w hw'
  have hk : k = j := by
    rcases Nat.lt_trichotomy k j with h | h | h
    · have := j4 (j - k) (by omega) (by omega)
      rw [hw, show p - j + k = p - (j - k) by omega] at k3
      rw [k3] at this; exact absurd k4 this
    · exact h
    · have := k5 j j1 h
      rw [hw, show p - j + j = p by omega, p3, hz] at this; cases this
  rw [hw', ← k3, hk, hw, show p - j + j = p by omega, p3]

end

end Nil.Invoice
