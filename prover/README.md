# Nil prover

The prover makes and checks the Groth16 zero-knowledge proofs Nil's web app needs in the browser: anonymous ballots, encrypted ballots, anonymous AI credits and Privacy Pools payouts. It is built on [snarkjs](https://github.com/iden3/snarkjs) and the iden3 libraries it uses.

## Licence

The prover is free software under the GNU General Public License, version 3 or (at your option) any later version. The full text is in [LICENSE](LICENSE). This folder, with the repository's `package.json` and `package-lock.json` that pin the libraries it bundles, is the prover's complete source. The rest of Nil, under the Business Source License 1.1, is a separate program.

## A separate program

The prover builds into one file, `dist/prover/prover-worker.js`, which a Nil server sends at `/prover/prover-worker.js`. The web app starts it as a Web Worker and never imports it, and the prover imports nothing from the app. They talk only through messages of plain data:

| Request | Reply |
|---|---|
| `{ id, op: "prove", input, wasm, zkey }`: the circuit's inputs, every number a decimal string, and the addresses of its `.wasm` and `.zkey` files | `{ id, ok: true, proof, publicSignals }`, every number a decimal string |
| `{ id, op: "verify", key, publicSignals, proof }`: a verification key, the public signals and a proof | `{ id, ok: true, valid }`, true only when the proof holds |
| anything else, or a request that fails | `{ id, ok: false, error }`, the reason in words |

The app fetches nothing for the prover: the prover reads the circuit files itself, from the addresses it's given. Proving and checking run on one thread, since Nil's content security policy blocks the extra workers snarkjs would otherwise start from generated code.

## Building

From the repository root, after `npm ci`:

```bash
npm run build:prover    # the prover alone, into dist/prover
npm run build           # the web app, then the prover, then the check that keeps them apart
```

`vite.config.mjs` in this folder is the prover's whole build. The same sources and lockfile give the same file, byte for byte, which is what `npm run verify:server` compares with a server.
