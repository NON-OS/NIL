pragma circom 2.1.5;

include "babyjub.circom";
include "escalarmulfix.circom";
include "escalarmulany.circom";
include "poseidon.circom";
include "comparators.circom";
include "bitify.circom";
include "binary-merkle-root.circom";

// One encrypted, weighted, anonymous ballot.
//
// It proves, without revealing who voted or how much weight they carry:
//   1. the voter knows the secret behind a Semaphore identity whose leaf, Poseidon(identity,
//      power), sits in this vote's census tree (so the weight is the one snapshotted for them);
//   2. the nullifier is Poseidon(scope, secret): one ballot per member per vote, re-votes replace;
//   3. every option carries an exponential ElGamal ciphertext under the vote's public key, and
//      exactly one of them (the chosen one) encrypts the voter's power; the rest encrypt zero.
// Ciphertexts add up, so trustees decrypt only the totals, never a single ballot.
template Ballot(MAX_DEPTH, OPTIONS) {
    signal input secret;
    signal input power;
    signal input merkleProofLength, merkleProofIndex, merkleProofSiblings[MAX_DEPTH];
    signal input choice;
    signal input randomness[OPTIONS];

    signal input scope;
    signal input optionCount;
    signal input publicKey[2];

    signal output merkleRoot, nullifier;
    signal output c1[OPTIONS][2];
    signal output c2[OPTIONS][2];

    // the secret must be a Baby Jubjub subgroup scalar, as Semaphore v4 requires
    var l = 2736030358979909402780800718157159386076813972158567259200215660948447373041;
    signal secretInRange <== LessThan(251)([secret, l]);
    secretInRange === 1;

    var Ax, Ay;
    (Ax, Ay) = BabyPbk()(secret);
    signal identity <== Poseidon(2)([Ax, Ay]);
    signal leaf <== Poseidon(2)([identity, power]);
    merkleRoot <== BinaryMerkleRoot(MAX_DEPTH)(leaf, merkleProofLength, merkleProofIndex, merkleProofSiblings);
    nullifier <== Poseidon(2)([scope, secret]);

    // weights stay below 2^40 so trustees can recover totals with a short discrete-log search
    signal powerBits[40] <== Num2Bits(40)(power);

    // the choice is a real option of this vote
    signal choiceBits[3] <== Num2Bits(3)(choice);
    signal countBits[4] <== Num2Bits(4)(optionCount);
    signal choiceInRange <== LessThan(4)([choice, optionCount]);
    choiceInRange === 1;
    signal countInRange <== LessEqThan(4)([optionCount, OPTIONS]);
    countInRange === 1;

    var BASE8[2] = [
        5299619240641551281634865583518297030282874472190772894086521144482721001553,
        16950150798460657717958625567821834550301663161624707787222815936182638968203
    ];

    // power·G once, then placed into the chosen option only
    signal powerScalar[253];
    for (var i = 0; i < 253; i++) powerScalar[i] <== i < 40 ? powerBits[i] : 0;
    signal powerPoint[2] <== EscalarMulFix(253, BASE8)(powerScalar);

    // the vote key must be a real curve point, or ciphertexts against it would mean nothing
    BabyCheck()(publicKey[0], publicKey[1]);

    signal chosen[OPTIONS];
    signal messageX[OPTIONS];
    signal messageY[OPTIONS];
    signal rBits[OPTIONS][251];
    signal rScalar[OPTIONS][253];
    signal shared[OPTIONS][2];
    for (var k = 0; k < OPTIONS; k++) {
        chosen[k] <== IsEqual()([choice, k]);
        // the identity point (0, 1) for every option not chosen
        messageX[k] <== chosen[k] * powerPoint[0];
        messageY[k] <== chosen[k] * (powerPoint[1] - 1) + 1;

        rBits[k] <== Num2Bits(251)(randomness[k]);
        for (var i = 0; i < 253; i++) rScalar[k][i] <== i < 251 ? rBits[k][i] : 0;

        c1[k] <== EscalarMulFix(253, BASE8)(rScalar[k]);
        shared[k] <== EscalarMulAny(253)(rScalar[k], publicKey);
        (c2[k][0], c2[k][1]) <== BabyAdd()(messageX[k], messageY[k], shared[k][0], shared[k][1]);
    }
}

component main { public [scope, optionCount, publicKey] } = Ballot(16, 8);
