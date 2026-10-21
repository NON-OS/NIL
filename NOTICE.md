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

The encrypted ballot circuit in [circuits/](circuits/) is built from circomlib templates (https://github.com/iden3/circomlib), which are GPL-3.0, so the circuit and the files compiled from it are GPL-3.0 as well.

Every other dependency is under a permissive licence (MIT, ISC, Apache-2.0, BSD or similar). `npm ls --omit=dev` lists them, and each package's own licence file is in `node_modules`.
