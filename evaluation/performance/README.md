### Performance & Gas Benchmarks - How to Run

This folder only contains documentation. All benchmark scripts live alongside existing code:

- Proof/off-chain benches: `backend/scripts/perf/*`
- On-chain, gas, E2E benches: `frontend/scripts/perf/*`

Use Node 18+.

### Prerequisites

- ZK backend running (for proof generation):
  - Configure `frontend/.env.local` for Supabase and ZK artifacts paths (backend reads it).
  - Build circuit artifacts (once):
    - `make compile setup-key generate-key` (generates `zk/outputs/*`)
  - Start backend:
    - `node backend/src/server.js` (or `npm --prefix backend run start`)
- RPC and wallet (for on-chain / E2E):
  - Uses `frontend/.env.local`:
    - `ARBITRUM_SEPOLIA_RPC_URL`, `REGISTRY_PRIVATE_KEY`, `REGISTRY_CONTRACT_ADDRESS`
    - Optional delegation: `EIP7702_AUTHORITY_ADDRESS`, `NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS`
- Wallet + PIN for proof generation:
  - Uses `NEXT_PUBLIC_MERCHANT_ADDRESS` and PIN `123456` by default (override via flags if needed)

---

### 1) Proof Generation Time

Measure Groth16 proof generation latency over multiple runs.

Run:

```bash
cd backend
npm i
npm run perf:proof
```

Output includes per-run ms, median, and p95. Targets:

- Median < 1000 ms
- 95th < 2000 ms

---

### 2) Verification Latency

#### Off-chain (snarkjs)

Runs `snarkjs.groth16.verify` repeatedly.

Run:

```bash
cd backend
npm run perf:verify
```

Or reuse existing files:

```bash
node backend/scripts/perf/offchain-verify-bench.js \
  --vk zk/outputs/verification_key.json \
  --proof zk/proofs/proof.json \
  --public zk/proofs/public.json \
  --runs 50
```

Target: < 100 ms.

#### On-chain (block inclusion time)

Measures time from tx submission to inclusion. Defaults use `frontend/.env.local`.

```bash
cd frontend
npm i
npm run perf:onchain
```

Optional: pass flags to override env (also records gas):

```bash
node scripts/perf/onchain-verify-bench.js \
  --delegation 0xDELEGATION --to 0xRECIPIENT --token 0xUSDC --amount 1000000
```

Target: inclusion < 5000 ms.

---

### 3) End-to-End Latency (capture → confirmation)

Breaks down: capture, proof gen, submission, confirmation.

Run:

```bash
cd frontend
npm run perf:e2e
```

Target: ≤ 8000 ms total user-perceived latency.

Notes:

- `--captureMs` simulates camera capture latency (set to your measured average if available).
- The submission and confirmation are measured separately by sending the tx directly (not via Next.js API which waits for confirmation).

---

### 4) Gas Cost Analysis

Recommended: measure on a local Anvil to avoid network variance.

1. Start Anvil:

```bash
anvil --port 8545
```

2. Run gas script (deploys verifier/registry/delegation/mocks and executes flows):

```bash
cd frontend
npm run perf:gas -- --rpc http://127.0.0.1:8545 --privateKey 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

It prints gasUsed for:

- Registry.register()
- Delegation.agree() (proof verification + transfer)
- Registry.recover()

Targets:

- Proof verification ≤ 450,000 gas
- Delegated transactions ≤ 400,000 gas

EmailDomainVerifier.verify():

- Not included in the automated script because it requires the vlayer prover path to satisfy the `onlyVerified` modifier.
- To measure it, run the vlayer example flow in `email_recovery/vlayer` (it already submits `verify` on-chain) and record `receipt.gasUsed`. If you want a fully automated path here, ping me and I’ll wire a minimal harness using `CustomFakeProofVerifier` to satisfy the modifier.

---

### Tips & Troubleshooting

- If proof generation fails:
  - Ensure `zk/outputs/pinVerification.wasm` and `.zkey` exist (see Makefile targets).
  - Ensure Supabase envs in `frontend/.env.local` are set and backend can reach the DB.
- If on-chain calls fail:
  - Verify you have funds on the provided key and correct chain RPC.
  - Double-check addresses: `--registry`, `--delegation`, token `--amount` fits token decimals.
- If you prefer npm scripts:
  - From `frontend/`: `npm run perf:onchain`, `npm run perf:gas`, `npm run perf:e2e` (pass flags after `--`).

---

### Outputs

All scripts print structured JSON with medians/p95 (for latency) or gas used (for gas).
You can pipe to files and compare runs:

```bash
npm run perf:proof --prefix backend > proof-gen.json
npm run perf:verify --prefix backend > verify-offchain.json
npm run perf:onchain --prefix frontend > onchain.json
```
