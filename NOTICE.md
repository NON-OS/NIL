# Third-party components

Nil's own code is under the Business Source License 1.1 (see [LICENSE](LICENSE)). The components below are not. They keep their own licences, which grant you rights the Business Source License doesn't take away.

## GPL-3.0

The zero-knowledge proofs behind anonymous votes, encrypted ballots, anonymous AI credits and Privacy Pools payouts are made and checked with these packages, all under the GNU General Public License v3:

| Package | Project |
|---|---|
| `snarkjs` | https://github.com/iden3/snarkjs |
| `ffjavascript` | https://github.com/iden3/ffjavascript |
| `wasmcurves` | https://github.com/iden3/wasmcurves |
| `wasmbuilder` | https://github.com/iden3/wasmbuilder |
| `fastfile` | https://github.com/iden3/fastfile |
| `r1csfile` | https://github.com/iden3/r1csfile |
| `@iden3/binfileutils` | https://github.com/iden3/binfileutils |
| `@iden3/bigarray` | https://github.com/iden3/bigarray |
| `circom_tester` | https://github.com/iden3/circom_tester |

They are used in three places, each kept apart from Nil's own code:

- In the browser, they are part of the prover. [prover/](prover/) is a separate program under the GNU GPL v3 or later (see [prover/LICENSE](prover/LICENSE)). It bundles snarkjs and the packages it needs into its own file, `/prover/prover-worker.js`, which a Nil server sends next to the web app. The web app runs that file as a Web Worker and exchanges only messages of plain data with it: circuit inputs and the addresses of circuit files in, proofs and yes-or-no answers out. No code of the web app is in the prover's file and no code of the prover is in the web app's files; `npm run build` checks the second and fails if it finds any. The prover's source is in this repository, and its [README](prover/README.md) explains how to build it on its own.
- On the server, they check proofs. The server calls snarkjs, directly and through `@semaphore-protocol/proof`, as a library inside its own Node.js process. Whoever runs a Nil server runs this code; hosted Nil runs it on the NØNOS foundation's machines and doesn't hand the server to the people who use it. This note is our reading and is waiting for a lawyer's confirmation.
- On a developer's machine, they build circuits and run the ceremony: the scripts in `scripts/` use snarkjs, and `circom_tester` comes in with the development dependencies. Neither is part of a build anyone is sent.

The encrypted ballot circuit in [circuits/](circuits/) is built from circomlib templates (https://github.com/iden3/circomlib), which are GPL-3.0, so the circuit and the files compiled from it are GPL-3.0 as well. Those files are data the prover reads, served from `/zk/` next to the app.

Every other dependency is under a permissive licence (MIT, ISC, Apache-2.0, BSD or similar). `npm ls --omit=dev` lists them, and each package's own licence file is in `node_modules`.

The file previews in Files load three of them into the browser: pdf.js (`pdfjs-dist`, Apache-2.0), mammoth (BSD-2-Clause) and DOMPurify (Apache-2.0 or MPL-2.0; Nil uses it under Apache-2.0). The build copies pdf.js's image decoders, Adobe CMaps, colour profile and standard fonts to `/assets/pdfjs-<version>/`, each with its licence file beside it: the Foxit fonts, the JPEG 2000 and JBIG2 decoders and the CMaps under BSD-style licences, the colour profile decoder under the MIT licence, and the colour profile under CC0. pdf.js's Liberation fonts, which are under the GNU GPL v2, are left out of the build.
