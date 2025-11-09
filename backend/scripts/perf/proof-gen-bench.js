#!/usr/bin/env node
/**
 * Proof Generation Latency Benchmark
 * - Calls backend /api/zk/nonce then /api/zk/proof repeatedly
 * - Reports median and 95th percentile
 *
 * Usage:
 *   node backend/scripts/perf/proof-gen-bench.js --backendUrl http://localhost:8787 --wallet 0x... --pin 123456 --runs 30 --intent 0
 */
const { argv } = require("node:process");
const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "../../../frontend/.env.local"),
});

function parseArgs() {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.split("=");
      const key = k.slice(2);
      args[key] = v ?? argv[++i];
    }
  }
  return {
    backendUrl:
      args.backendUrl ||
      process.env.NEXT_PUBLIC_ZK_BACKEND_URL ||
      "http://localhost:8787",
    wallet: args.wallet || process.env.NEXT_PUBLIC_MERCHANT_ADDRESS,
    pin: args.pin || "123456",
    runs: Number(args.runs || process.env.PERF_PROOF_RUNS || 30),
    intent: Number(args.intent || process.env.PERF_INTENT || 0),
  };
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

async function main() {
  const { backendUrl, wallet, pin, runs, intent } = parseArgs();
  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    throw new Error("Missing or invalid --wallet (0x...)");
  }
  if (!pin || !/^\d{6}$/.test(pin)) {
    throw new Error("Missing or invalid --pin (6 digits)");
  }
  if (!Number.isFinite(runs) || runs <= 0) {
    throw new Error("--runs must be a positive number");
  }

  const latenciesMs = [];
  const details = [];
  for (let i = 0; i < runs; i++) {
    // Get nonce
    const nonceRes = await fetch(`${backendUrl}/api/zk/nonce`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: wallet, intent }),
    });
    const nonceJson = await nonceRes.json();
    if (!nonceRes.ok)
      throw new Error(`nonce error: ${nonceJson?.error || "unknown"}`);
    const { nonce } = nonceJson;

    // Time proof generation
    const t0 = process.hrtime.bigint();
    const proofRes = await fetch(`${backendUrl}/api/zk/proof`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: wallet, pin, intent, nonce }),
    });
    const proofJson = await proofRes.json();
    const t1 = process.hrtime.bigint();
    if (!proofRes.ok)
      throw new Error(`proof error: ${proofJson?.error || "unknown"}`);

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
    target: { medianLtMs: 1000, p95LtMs: 2000 },
  };
  console.log(JSON.stringify({ summary, details }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
