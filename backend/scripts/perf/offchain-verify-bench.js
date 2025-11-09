#!/usr/bin/env node
/**
 * Off-chain Verification Latency Benchmark
 * - Uses snarkjs.groth16.verify with a provided or freshly generated proof
 * - Reports median and 95th percentile
 *
 * Usage:
 *   node backend/scripts/perf/offchain-verify-bench.js --vk zk/outputs/verification_key.json --backendUrl http://localhost:8787 --wallet 0x... --pin 123456 --intent 0 --runs 50
 *   or
 *   node backend/scripts/perf/offchain-verify-bench.js --vk zk/outputs/verification_key.json --proof zk/proofs/proof.json --public zk/proofs/public.json --runs 50
 */
const fs = require("fs");
const path = require("path");
const snarkjs = require("snarkjs");
require("dotenv").config({
  path: path.resolve(__dirname, "../../../frontend/.env.local"),
});

function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.split("=");
      const key = k.slice(2);
      args[key] = v ?? process.argv[++i];
    }
  }
  return {
    vk: args.vk || "zk/outputs/verification_key.json",
    proofPath: args.proof || "",
    publicPath: args.public || "",
    backendUrl:
      args.backendUrl ||
      process.env.NEXT_PUBLIC_ZK_BACKEND_URL ||
      "http://localhost:8787",
    wallet: args.wallet || process.env.NEXT_PUBLIC_MERCHANT_ADDRESS || "",
    pin: args.pin || "123456",
    intent: Number(args.intent || process.env.PERF_INTENT || 0),
    runs: Number(args.runs || process.env.PERF_VERIFY_RUNS || 50),
  };
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

async function getProofFromBackend(backendUrl, wallet, pin, intent) {
  if (!backendUrl) throw new Error("Missing --backendUrl");
  const nonceRes = await fetch(`${backendUrl}/api/zk/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: wallet, intent }),
  });
  const nonceJson = await nonceRes.json();
  if (!nonceRes.ok)
    throw new Error(`nonce error: ${nonceJson?.error || "unknown"}`);
  const { nonce } = nonceJson;
  const proofRes = await fetch(`${backendUrl}/api/zk/proof`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: wallet, pin, intent, nonce }),
  });
  const proofJson = await proofRes.json();
  if (!proofRes.ok)
    throw new Error(`proof error: ${proofJson?.error || "unknown"}`);
  return { proof: proofJson.proof, publicSignals: proofJson.publicSignals };
}

async function main() {
  const { vk, proofPath, publicPath, backendUrl, wallet, pin, intent, runs } =
    parseArgs();
  if (!Number.isFinite(runs) || runs <= 0)
    throw new Error("--runs must be positive");
  // Resolve verification key path (support running from backend/ and repo root)
  let vkPath = path.resolve(vk);
  if (!fs.existsSync(vkPath)) {
    const rootVk = path.resolve(__dirname, "../../../zk/outputs/verification_key.json");
    if (fs.existsSync(rootVk)) {
      vkPath = rootVk;
    }
  }
  const vkObj = JSON.parse(fs.readFileSync(vkPath, "utf8"));

  let proof;
  let publicSignals;
  if (proofPath && publicPath) {
    proof = JSON.parse(fs.readFileSync(path.resolve(proofPath), "utf8"));
    publicSignals = JSON.parse(
      fs.readFileSync(path.resolve(publicPath), "utf8")
    );
  } else {
    if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet))
      throw new Error("Missing/invalid --wallet");
    if (!pin || !/^\d{6}$/.test(pin)) throw new Error("Missing/invalid --pin");
    const res = await getProofFromBackend(
      backendUrl || "http://localhost:8787",
      wallet,
      pin,
      intent
    );
    proof = res.proof;
    publicSignals = res.publicSignals;
  }

  const latenciesMs = [];
  const details = [];
  for (let i = 0; i < runs; i++) {
    const t0 = process.hrtime.bigint();
    const ok = await snarkjs.groth16.verify(vkObj, publicSignals, proof);
    const t1 = process.hrtime.bigint();
    if (!ok) throw new Error("Verification failed");
    const ms = Number(t1 - t0) / 1e6;
    latenciesMs.push(ms);
    details.push({ run: i + 1, ms: Number(ms.toFixed(2)) });
  }

  const median = percentile(latenciesMs, 50);
  const p95 = percentile(latenciesMs, 95);
  const summary = {
    runs,
    medianMs: Number(median.toFixed(2)),
    p95Ms: Number(p95.toFixed(2)),
    target: { offchainVerifyLtMs: 100 },
  };
  console.log(JSON.stringify({ summary, details }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
