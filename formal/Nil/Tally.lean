import Nil.Group

/-!
Exponential ElGamal as Nil's encrypted votes use it (server/votes/encrypted). A ballot encrypts
its choice for one option as Enc(m, r) = (r·G, m·G + r·H), where H = x·G is the vote's public
key. The server adds ciphertexts (aggregateBallots), two trustees hand in partials s_i·C1, and
combineTotals turns them into C2 − x·C1 with Lagrange coefficients, then solves a bounded
discrete log.
-/

namespace Nil.Tally

open IntGroup

variable {G : Type} [IntGroup G]

/-- A ciphertext: the pair (C1, C2). -/
structure Cipher (G : Type) where
  c1 : G
  c2 : G

def enc (g : G) (x m r : Int) : Cipher G := ⟨r • g, m • g + r • (x • g)⟩

def addC (a b : Cipher G) : Cipher G := ⟨a.c1 + b.c1, a.c2 + b.c2⟩

/-- A ballot's choice for one option and the randomness it was encrypted with. -/
structure Ballot where
  m : Int
  r : Int

/-- What the server sums, option by option: start at the identity and add each ciphertext. -/
def aggregate (cs : List (Cipher G)) : Cipher G := cs.foldl addC ⟨0, 0⟩

def totalChoice (bs : List Ballot) : Int := bs.foldr (fun b s => b.m + s) 0
def totalRandom (bs : List Ballot) : Int := bs.foldr (fun b s => b.r + s) 0

def decrypt (x : Int) (c : Cipher G) : G := c.c2 - x • c.c1

theorem enc_add (g : G) (x m r m' r' : Int) :
    addC (enc g x m r) (enc g x m' r') = enc g x (m + m') (r + r') := by
  simp only [enc, addC, add_smul, add_add_add_comm]

theorem foldl_addC (g : G) (x : Int) (bs : List Ballot) (m r : Int) :
    (bs.map fun b => enc g x b.m b.r).foldl addC (enc g x m r)
      = enc g x (m + totalChoice bs) (r + totalRandom bs) := by
  induction bs generalizing m r with
  | nil => simp [totalChoice, totalRandom]
  | cons b bs ih =>
    simp only [List.map_cons, List.foldl_cons, enc_add, ih, totalChoice, totalRandom,
      List.foldr_cons]
    congr 1 <;> omega

/-- Adding up encrypted ballots gives an encryption of the sum of their choices under the sum of
their randomness: the server can count without opening any ballot. -/
theorem aggregate_enc (g : G) (x : Int) (bs : List Ballot) :
    aggregate (bs.map fun b => enc g x b.m b.r) = enc g x (totalChoice bs) (totalRandom bs) := by
  have h0 : (⟨0, 0⟩ : Cipher G) = enc g x 0 0 := by
    simp [enc, zero_smul, add_zero]
  rw [aggregate, h0, foldl_addC]; simp

/-- Whoever holds x gets C2 − x·C1 = m·G: the vote's total, as a multiple of the generator. -/
theorem decrypt_enc (g : G) (x m r : Int) : decrypt x (enc g x m r) = m • g := by
  simp only [decrypt, enc]
  rw [← mul_smul, Int.mul_comm, mul_smul, add_sub_cancel]

/-- Decrypting the sum of all ballots gives the sum of the choices times the generator. -/
theorem decrypt_aggregate (g : G) (x : Int) (bs : List Ballot) :
    decrypt x (aggregate (bs.map fun b => enc g x b.m b.r)) = totalChoice bs • g := by
  rw [aggregate_enc, decrypt_enc]

/-! ## Two of three trustees -/

/-- Trustee `i` holds the share f(i) = x + c·i of a degree-1 polynomial whose value at zero is the
key. With the distributed key setup, x and c are the sums of every trustee's own line. -/
def share (x c i : Int) : Int := x + c * i

/-- The Lagrange coefficients at zero for trustees at positions a and b, given inverses of b − a
and a − b modulo q, as combineTotals computes them. -/
def lagrangeA (b u : Int) : Int := b * u
def lagrangeB (a v : Int) : Int := a * v

/-- What combineTotals computes from two partials d_a = s_a·C1 and d_b = s_b·C1. -/
def combine (la lb : Int) (c : Cipher G) (da db : G) : G := c.c2 - (la • da + lb • db)

theorem lagrange_at_zero (P : PrimeOrder G) (x c a b u v : Int)
    (hu : P.q ∣ (b - a) * u - 1) (hv : P.q ∣ (a - b) * v - 1) :
    P.q ∣ (lagrangeA b u * share x c a + lagrangeB a v * share x c b) - x := by
  -- u + v ≡ 0, since (b − a)(u + v) ≡ 1 − 1 and q doesn't divide b − a
  have hd : ¬ P.q ∣ b - a := by
    intro h
    have : P.q ∣ 1 := by
      have h1 : P.q ∣ (b - a) * u := Int.dvd_trans h (Int.dvd_mul_right _ _)
      have := Int.dvd_sub h1 hu
      rwa [show (b - a) * u - ((b - a) * u - 1) = 1 by omega] at this
    have := Int.le_of_dvd (by decide) this
    have := P.one_lt; omega
  have huv : P.q ∣ u + v := by
    have : P.q ∣ (b - a) * (u + v) := by
      have := Int.dvd_sub hu hv
      have e : (b - a) * u - 1 - ((a - b) * v - 1) = (b - a) * (u + v) := by grind
      rwa [e] at this
    rcases P.prime _ _ this with h | h
    · exact absurd h hd
    · exact h
  have e : lagrangeA b u * share x c a + lagrangeB a v * share x c b - x
      = x * ((b - a) * u - 1) + (x * a + c * a * b) * (u + v) := by
    simp only [lagrangeA, lagrangeB, share]; grind
  rw [e]
  exact Int.dvd_add (Int.dvd_trans hu (Int.dvd_mul_left _ _)) (Int.dvd_trans huv (Int.dvd_mul_left _ _))

/-- Any two of the three trustees, combining their partials with the Lagrange coefficients,
recover the same point as decrypting with the whole key x. No one ever needs to hold x. -/
theorem threshold_eq_decrypt (P : PrimeOrder G) (x c a b u v la lb : Int) (ct : Cipher G)
    (hu : P.q ∣ (b - a) * u - 1) (hv : P.q ∣ (a - b) * v - 1)
    (hla : P.q ∣ la - lagrangeA b u) (hlb : P.q ∣ lb - lagrangeB a v) :
    combine la lb ct (share x c a • ct.c1) (share x c b • ct.c1) = decrypt x ct := by
  simp only [combine, decrypt]
  rw [P.smul_congr hla, P.smul_congr hlb, ← mul_smul, ← mul_smul, ← add_smul]
  rw [P.smul_congr (lagrange_at_zero P x c a b u v hu hv)]

/-- Two trustees decrypting the server's sum get exactly (Σ m)·G. -/
theorem threshold_total (P : PrimeOrder G) (x c a b u v la lb : Int) (bs : List Ballot)
    (hu : P.q ∣ (b - a) * u - 1) (hv : P.q ∣ (a - b) * v - 1)
    (hla : P.q ∣ la - lagrangeA b u) (hlb : P.q ∣ lb - lagrangeB a v) :
    let ct := aggregate (bs.map fun b => enc P.gen x b.m b.r)
    combine la lb ct (share x c a • ct.c1) (share x c b • ct.c1) = totalChoice bs • P.gen := by
  intro ct
  rw [threshold_eq_decrypt P x c a b u v la lb ct hu hv hla hlb, decrypt_aggregate]

/-- The bounded discrete log returns the total itself, as long as totals are known to lie in
[0, bound] and the bound is below q. `t` is whatever the solver returned, checked by its own
definition: t·G equals the point it was asked about. -/
theorem solve_total (P : PrimeOrder G) (bound t : Int) (bs : List Ballot)
    (hb : bound < P.q) (ht : 0 ≤ t ∧ t ≤ bound) (hT : 0 ≤ totalChoice bs ∧ totalChoice bs ≤ bound)
    (hsolve : t • P.gen = totalChoice bs • P.gen) : t = totalChoice bs :=
  P.eq_of_dvd_of_range ((P.gen_smul_eq_iff _ _).1 hsolve) ht.1 (by omega) hT.1 (by omega)

/-- What a trustee's decryption computes depends on the ballots only through their total: two
verified ballot lists with the same total produce the very same point, whatever the individual
choices and randomness. This is a statement about the computed value, not about secrecy. -/
theorem decryption_depends_only_on_total (P : PrimeOrder G) (x c a b u v la lb : Int)
    (bs bs' : List Ballot) (hu : P.q ∣ (b - a) * u - 1) (hv : P.q ∣ (a - b) * v - 1)
    (hla : P.q ∣ la - lagrangeA b u) (hlb : P.q ∣ lb - lagrangeB a v)
    (same : totalChoice bs = totalChoice bs') :
    let ct := aggregate (bs.map fun b => enc P.gen x b.m b.r)
    let ct' := aggregate (bs'.map fun b => enc P.gen x b.m b.r)
    combine la lb ct (share x c a • ct.c1) (share x c b • ct.c1)
      = combine la lb ct' (share x c a • ct'.c1) (share x c b • ct'.c1) := by
  intro ct ct'
  rw [threshold_total P x c a b u v la lb bs hu hv hla hlb,
    threshold_total P x c a b u v la lb bs' hu hv hla hlb, same]

/-- With a single ballot in the list, the total is that ballot's choice, so the decryption
reveals it. This is the one case where the output says something about a single ballot. -/
theorem single_ballot_total (b : Ballot) : totalChoice [b] = b.m := by
  simp [totalChoice]

end Nil.Tally
