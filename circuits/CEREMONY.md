# The ballot ceremony

Encrypted weighted votes prove each ballot with a zero-knowledge proof. The keys for those proofs come from a two-phase setup, and whoever knew all the randomness that went into it could forge proofs. Phase 1 is the Perpetual Powers of Tau, built by more than 80 people. Phase 2 is specific to Nil's ballot circuit, and this page is how to run it between people who don't have to trust each other.

The rule that makes it safe: the keys are sound as long as one contributor's randomness is gone for good. With five independent people, all five would have to keep their randomness and work together to forge a ballot.

`circuits/CEREMONY.json` is the public record: the phase 1 file, every contribution's name and hash, the beacon and the hashes of the files the app uses.

## How it runs

One person coordinates. Contributors go one after another, each taking the key the previous one made and passing on the next. Each contribution takes a minute or two on a laptop, plus downloading and uploading a 16 MB file.

Coordinate in one public place, such as a GitHub issue, where every file and every hash is posted. That place is the ceremony's history, and anyone can follow it.

## For contributors

You need a computer you trust, Node.js 22 and git. Download the latest key from the ceremony thread, then:

```bash
git clone https://github.com/NON-OS/NIL-.git nil-ceremony
cd nil-ceremony
npm ci
npm run ceremony:contribute -- ~/Downloads/ballot_0003.zkey --name "Your name or handle"
```

Use the file name you were given. The command mixes 64 random bytes from your machine into the key, writes the next one beside it (here `ballot_0004.zkey`) and prints your contribution hash.

1. Upload the new key to the ceremony thread. GitHub only takes certain file types, so compress it first with `gzip -k ballot_0004.zkey` and attach `ballot_0004.zkey.gz`; whoever is next runs `gunzip` on it.
2. Post your contribution hash there and anywhere else people know you, such as your X account. It's how anyone can tell later that your contribution is in the final keys.
3. Close the terminal. The randomness only ever lived in that process, and there's nothing to keep.

If you'd rather not install Nil, snarkjs alone does the same job. It asks you to type random text instead of drawing it for you:

```bash
npx -y snarkjs@0.7.5 zkey contribute ballot_0003.zkey ballot_0004.zkey --name="Your name or handle"
```

## For the coordinator

From a clean checkout with `npm ci` done:

1. Start. This compiles the circuit, downloads phase 1 and checks it against the record, and writes the first key:

   ```bash
   npm run ceremony:start
   ```

   Post `ceremony/ballot_0000.zkey` and its SHA-256 (printed) in the thread. Keep the `ceremony` folder; it's ignored by git.

2. Pass the key along. After each contribution, check that the uploaded file is named with the next number and that the contributor posted their hash.

3. Announce the beacon before the last contribution: an Ethereum block number about 150 blocks (half an hour) ahead. Its hash is randomness nobody can know in advance, and it closes the chain so the last contributor can't choose how it ends.

4. Once that block is final, usually 15 minutes after it's made, finish:

   ```bash
   npm run ceremony:finish -- ceremony/ballot_0005.zkey --beacon-block 23600150
   ```

   This applies the beacon, verifies the entire chain from phase 1 through every contribution, and only if it verifies installs `client/public/zk/ballot.zkey`, `client/public/zk/ballot.wasm`, `server/votes/ballotKey.json` and the new `circuits/CEREMONY.json`. It prints each contribution's name and hash. Check them against what the contributors posted.

5. Run `npm test`, then commit the four files. Votes started with the old keys can't be finished with the new ones, so do this before anyone relies on encrypted votes, or let open ones close first.

6. Update the README's Honest limits and the votes and privacy pages: phase 2 is no longer a development ceremony. Publish the list of contributors and their hashes with the release, and write a new release manifest, since the key is part of the web app.

## Checking the result yourself

Anyone can recheck the final keys without trusting the coordinator. With phase 1 downloaded (the start command does it) and the circuit compiled:

```bash
npx -y snarkjs@0.7.5 zkey verify ceremony/ballot.r1cs ceremony/ppot_0080_16.ptau client/public/zk/ballot.zkey
```

It lists every contribution and the beacon, and ends with `ZKey Ok!` only if the chain is sound.
