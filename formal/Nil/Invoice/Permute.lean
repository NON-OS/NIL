import Nil.Invoice.Walk

/-!
server/billing/permute.js: a balanced Feistel network with 8 rounds over `half`-bit halves,
walked until it lands in 1 … size − 1, where size = 10^digits. The round function is
HMAC-SHA256 of the key, masked to `half` bits; here it is any function `f`, since the proofs hold
whatever the key and the hash are. In the JavaScript, `v >>> half`, `v & mask` and
`(left << half) | right` are v / 2^half, v % 2^half and left · 2^half + right for these sizes
(at most 20 bits), and `x & mask` with mask = 2^half − 1 is x % 2^half.
-/

namespace Nil.Invoice

def ROUNDS : Nat := 8

def round (half : Nat) (f : Nat → Nat → Nat) (r : Nat) (p : Nat × Nat) : Nat × Nat :=
  (p.2, p.1 ^^^ (f r p.2 % 2 ^ half))

def rounds (half : Nat) (f : Nat → Nat → Nat) : Nat → Nat × Nat → Nat × Nat
  | 0, p => p
  | n + 1, p => round half f n (rounds half f n p)

def feistel (half : Nat) (f : Nat → Nat → Nat) (v : Nat) : Nat :=
  let p := rounds half f ROUNDS (v / 2 ^ half, v % 2 ^ half)
  p.1 * 2 ^ half + p.2

def inRange (size v : Nat) : Bool := v < size && v != 0

/-- permute(x, digits, key) with `size` = 10^digits. Fuel 4^half is enough (`permute_total`). -/
def permute (half : Nat) (f : Nat → Nat → Nat) (size x : Nat) : Option Nat :=
  walk (feistel half f) (inRange size) (2 ^ half * 2 ^ half) x

/-- The `half` permute.js uses: ceil(ceil(log2 size) / 2). -/
def halfFor (size : Nat) : Nat := (Nat.log2 (size - 1) + 1 + 1) / 2

theorem log2_of (n m : Nat) (h : 2 ^ m ≤ n ∧ n < 2 ^ (m + 1)) : Nat.log2 n = m := by
  have hn : n ≠ 0 := by have := Nat.pow_pos (n := m) (show 0 < 2 by decide); omega
  have a := (Nat.le_log2 hn).2 h.1
  have b := (Nat.log2_lt hn).2 h.2
  omega

/-- For every suffix length the server allows (2 to 6 digits), the halves permute.js picks
cover 1 … 10^digits − 1, which is the hypothesis the theorems below need. -/
theorem halfFor_covers :
    [2, 3, 4, 5, 6].map (fun d => halfFor (10 ^ d)) = [4, 5, 7, 9, 10] ∧
    ∀ h ∈ [(2, 4), (3, 5), (4, 7), (5, 9), (6, 10)], 10 ^ h.1 ≤ 2 ^ h.2 * 2 ^ h.2 := by
  refine ⟨?_, by decide⟩
  simp only [List.map, halfFor]
  rw [log2_of (10 ^ 2 - 1) 6 (by decide), log2_of (10 ^ 3 - 1) 9 (by decide),
    log2_of (10 ^ 4 - 1) 13 (by decide), log2_of (10 ^ 5 - 1) 16 (by decide),
    log2_of (10 ^ 6 - 1) 19 (by decide)]

theorem pack_lt {m L R : Nat} (hL : L < m) (hR : R < m) : L * m + R < m * m := by
  have : (L + 1) * m ≤ m * m := Nat.mul_le_mul_right _ hL
  rw [Nat.add_mul, Nat.one_mul] at this; omega

theorem round_lt (half : Nat) (f : Nat → Nat → Nat) (r : Nat) (p : Nat × Nat)
    (h1 : p.1 < 2 ^ half) (h2 : p.2 < 2 ^ half) :
    (round half f r p).1 < 2 ^ half ∧ (round half f r p).2 < 2 ^ half :=
  ⟨h2, Nat.xor_lt_two_pow h1 (Nat.mod_lt _ (Nat.pow_pos (by decide)))⟩

theorem rounds_lt (half : Nat) (f : Nat → Nat → Nat) (n : Nat) (p : Nat × Nat)
    (h1 : p.1 < 2 ^ half) (h2 : p.2 < 2 ^ half) :
    (rounds half f n p).1 < 2 ^ half ∧ (rounds half f n p).2 < 2 ^ half := by
  induction n with
  | zero => exact ⟨h1, h2⟩
  | succ n ih => exact round_lt half f n _ ih.1 ih.2

theorem round_inj (half : Nat) (f : Nat → Nat → Nat) (r : Nat) (p p' : Nat × Nat)
    (h : round half f r p = round half f r p') : p = p' := by
  simp only [round, Prod.mk.injEq] at h
  obtain ⟨h2, h1⟩ := h
  rw [h2] at h1
  have := congrArg (· ^^^ (f r p'.2 % 2 ^ half)) h1
  simp only [Nat.xor_assoc, Nat.xor_self, Nat.xor_zero] at this
  exact Prod.ext this h2

theorem rounds_inj (half : Nat) (f : Nat → Nat → Nat) (n : Nat) (p p' : Nat × Nat)
    (h : rounds half f n p = rounds half f n p') : p = p' := by
  induction n with
  | zero => exact h
  | succ n ih => exact ih (round_inj half f n _ _ h)

theorem unpack_lt {m v : Nat} (hm : 0 < m) (hv : v < m * m) : v / m < m ∧ v % m < m :=
  ⟨(Nat.div_lt_iff_lt_mul hm).2 hv, Nat.mod_lt _ hm⟩

theorem pack_inj {m : Nat} (p p' : Nat × Nat) (h2 : p.2 < m) (h2' : p'.2 < m)
    (h : p.1 * m + p.2 = p'.1 * m + p'.2) : p = p' := by
  have hm : 0 < m := by omega
  have d := congrArg (· / m) h
  have r := congrArg (· % m) h
  simp only at d r
  rw [Nat.mul_comm p.1, Nat.mul_comm p'.1, Nat.mul_add_div hm, Nat.mul_add_div hm,
    Nat.div_eq_of_lt h2, Nat.div_eq_of_lt h2'] at d
  rw [Nat.mul_comm p.1, Nat.mul_comm p'.1, Nat.mul_add_mod, Nat.mul_add_mod, Nat.mod_eq_of_lt h2,
    Nat.mod_eq_of_lt h2'] at r
  exact Prod.ext (by simpa using d) r

/-- The network maps [0, 4^half) into itself. -/
theorem feistel_lt (half : Nat) (f : Nat → Nat → Nat) (v : Nat) (hv : v < 2 ^ half * 2 ^ half) :
    feistel half f v < 2 ^ half * 2 ^ half := by
  have hm : 0 < 2 ^ half := Nat.pow_pos (by decide)
  have hu := unpack_lt hm hv
  have hr := rounds_lt half f ROUNDS (v / 2 ^ half, v % 2 ^ half) hu.1 hu.2
  exact pack_lt hr.1 hr.2

/-- The network is injective on [0, 4^half), whatever the round function. -/
theorem feistel_inj (half : Nat) (f : Nat → Nat → Nat) (a b : Nat)
    (ha : a < 2 ^ half * 2 ^ half) (hb : b < 2 ^ half * 2 ^ half)
    (h : feistel half f a = feistel half f b) : a = b := by
  have hm : 0 < 2 ^ half := Nat.pow_pos (by decide)
  have hua := unpack_lt hm ha
  have hub := unpack_lt hm hb
  have hra := rounds_lt half f ROUNDS (a / 2 ^ half, a % 2 ^ half) hua.1 hua.2
  have hrb := rounds_lt half f ROUNDS (b / 2 ^ half, b % 2 ^ half) hub.1 hub.2
  have e := rounds_inj half f ROUNDS _ _ (pack_inj _ _ hra.2 hrb.2 h)
  simp only [Prod.mk.injEq] at e
  rw [← Nat.div_add_mod a (2 ^ half), ← Nat.div_add_mod b (2 ^ half), e.1, e.2]

/-! ## The shuffle of suffixes -/

section

variable (half : Nat) (f : Nat → Nat → Nat) (size : Nat) (hsize : size ≤ 2 ^ half * 2 ^ half)
include hsize

theorem inRange_lt (v : Nat) (h : inRange size v) : v < 2 ^ half * 2 ^ half := by
  simp [inRange] at h; omega

/-- permute always returns a suffix for an input in 1 … size − 1 (the JavaScript loop ends). -/
theorem permute_total (x : Nat) (hx : inRange size x) : ∃ w, permute half f size x = some w :=
  walk_total (fun v hv => feistel_lt half f v hv) (fun a b ha hb => feistel_inj half f a b ha hb)
    (inRange_lt half size hsize) x hx

omit hsize in
/-- What permute returns is again in 1 … size − 1. -/
theorem permute_range (x w : Nat) (h : permute half f size x = some w) : inRange size w := by
  obtain ⟨_, _, _, _, hw, _⟩ := walk_some _ _ _ h; exact hw

/-- The slot permutation is one to one on 1 … size − 1: two inputs never share a suffix. -/
theorem permute_inj (x y w : Nat) (hx : inRange size x) (hy : inRange size y)
    (ex : permute half f size x = some w) (ey : permute half f size y = some w) : x = y :=
  walk_inj (fun v hv => feistel_lt half f v hv) (fun a b ha hb => feistel_inj half f a b ha hb)
    (inRange_lt half size hsize) x y w hx hy ex ey

/-- And onto: every suffix in 1 … size − 1 is the image of exactly one input. -/
theorem permute_onto (z : Nat) (hz : inRange size z) :
    ∃ x, inRange size x ∧ permute half f size x = some z :=
  walk_onto (fun v hv => feistel_lt half f v hv) (fun a b ha hb => feistel_inj half f a b ha hb)
    (inRange_lt half size hsize) z hz

end

/-! ## Slots -/

/-- pickSuffix's input for draw `r` in slot `index` of `count`: 1 + index · capacity + r. -/
def slotInput (size count index r : Nat) : Nat := 1 + index * ((size - 1) / count) + r

theorem slotInput_range (size count index r : Nat) (hi : index < count)
    (hr : r < (size - 1) / count) : inRange size (slotInput size count index r) := by
  have : (index + 1) * ((size - 1) / count) ≤ count * ((size - 1) / count) :=
    Nat.mul_le_mul_right _ hi
  have : count * ((size - 1) / count) ≤ size - 1 := Nat.mul_div_le _ _
  simp [inRange, slotInput]; rw [Nat.add_mul] at *; omega

theorem slotInput_ne (size count i j r s : Nat) (hij : i < j)
    (hr : r < (size - 1) / count) : slotInput size count i r ≠ slotInput size count j s := by
  have : (i + 1) * ((size - 1) / count) ≤ j * ((size - 1) / count) := Nat.mul_le_mul_right _ hij
  simp only [slotInput]; rw [Nat.add_mul] at this; omega

/-- Two workspaces in different slots on one treasury are never handed the same suffix, keyed
shuffle or not. -/
theorem slots_disjoint (half : Nat) (f : Nat → Nat → Nat) (size count i j r s w : Nat)
    (hsize : size ≤ 2 ^ half * 2 ^ half) (hi : i < count) (hj : j < count) (hij : i ≠ j)
    (hr : r < (size - 1) / count) (hs : s < (size - 1) / count)
    (ei : permute half f size (slotInput size count i r) = some w)
    (ej : permute half f size (slotInput size count j s) = some w) : False := by
  have e := permute_inj half f size hsize _ _ w (slotInput_range size count i r hi hr)
    (slotInput_range size count j s hj hs) ei ej
  rcases Nat.lt_or_gt_of_ne hij with h | h
  · exact slotInput_ne size count i j r s h hr e
  · exact slotInput_ne size count j i s r h hs e.symm

end Nil.Invoice
