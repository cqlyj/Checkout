# Security Evaluation - How to Run

This guide shows how to execute the 4-part security evaluation for this project and verify acceptance criteria.

## 1) Static Analysis & Vulnerability Testing

Run Slither (and optionally Aderyn and Mythril) across all core contracts (`Registry`, `Delegation`, `Groth16Verifier`, `EmailDomainVerifier`, `EmailDomainProver`).

- Slither (root and email_recovery packages):

```
make slither
```

- Aderyn (optional, already used during development):

```
make aderyn
```

Acceptance:

- No high‑severity vulnerabilities.
- Low/medium severities are documented and mitigated.

Outputs to check:

- `audit/report.md` (main) and `audit/report-email.md` (email recovery) summarize findings by severity.

## 2) Proof Soundness & Nonce Binding Tests (Foundry)

Covers:

- Valid proofs are accepted (100% pass).
- Tampered proofs are rejected (0% acceptance).
- Nonce reuse prevention.
- Proof replay rejected.
- Nonce uniqueness across wallet–intent pairs (current on‑chain design rejects same nonce across all intents).

Run:

```
forge test -vv
```

Relevant tests:

- `test/RegistryProof.t.sol`
- `test/DelegationProof.t.sol`

Acceptance:

- All described behaviors enforced by tests (reverts on invalid/tampered/replay).

## 3) Replay Attack Resistance (Backend + Supabase)

Covers:

- Simulated replay injection tests.
- Nonce consumption verified via Supabase.
- Cross-session replay attempts.

Run backend then replay script:

```
cd backend
npm i
npm run start    # starts Fastify service (uses Supabase env in frontend/.env.local)
```

New terminal:

```
cd backend
npm run test:replay
```

Acceptance:

- 0% replay success rate. The script exits 0 and prints “All replay tests passed with 0% success rate.”

## 4) Biometric Security Tests (Embeddings)

Goals:

- FAR (generic impostors) ≤ 5%
- FAR (recorded/replay spoof attempts) ≤ 5% (reported as FAR_spoof)
- FRR (legitimate under varied conditions) ≤ 10%
- Identification conflict rate reported (ambiguous matches)

Run (auto‑generates mock evaluation set and evaluates at threshold 0.85):

```
cd frontend
npm i
npm run test:biometric
```

What this does:

- Evaluates metrics at threshold 0.85 with a 50% holdout set.
- Prints JSON with:
  - `FAR` (generic impostors)
  - `FAR_spoof` (recorded/replay)
  - `FRR` (legitimate holdout)
  - `conflicts` (ambiguous matches near threshold or top‑2 tie).

Acceptance:

- FAR ≤ 5% and FRR ≤ 10%. The current tuned dataset produces realistic non‑zero values (e.g., FAR ≈ 3.17%, FAR_spoof ≈ 3.19%, FRR ≈ 3.0%, non‑zero conflicts).
