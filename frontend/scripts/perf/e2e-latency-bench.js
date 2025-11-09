#!/usr/bin/env node
/**
 * End-to-End Latency Benchmark
 * Measures from "facial capture" (simulated) through proof generation, submission, and confirmation.
 *
 * Usage:
 *   node scripts/perf/e2e-latency-bench.js \
 *     --rpc https://arb-sepolia... \
 *     --privateKey 0x... \
 *     --registry 0x... \
 *     --backendUrl http://localhost:8787 \
 *     --wallet 0x... \
 *     --pin 123456 \
 *     --captureMs 0 \
 *     --runs 5
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path");
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env.local"),
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createWalletClient, createPublicClient, http } = require("viem");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { privateKeyToAccount } = require("viem/accounts");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const crypto = require("node:crypto");

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
    rpc: args.rpc || process.env.ARBITRUM_SEPOLIA_RPC_URL,
    privateKey: args.privateKey || process.env.REGISTRY_PRIVATE_KEY,
    registry: args.registry || process.env.REGISTRY_CONTRACT_ADDRESS,
    backendUrl:
      args.backendUrl ||
      process.env.NEXT_PUBLIC_ZK_BACKEND_URL ||
      "http://localhost:8787",
    wallet: args.wallet || process.env.NEXT_PUBLIC_MERCHANT_ADDRESS,
    pin: args.pin || "123456",
    intent: Number(args.intent || process.env.PERF_INTENT || 0),
    captureMs: Number(args.captureMs || process.env.PERF_CAPTURE_MS || 0),
    runs: Number(args.runs || process.env.PERF_E2E_RUNS || 5),
  };
}

function loadAbi(relative) {
  const p = path.resolve(__dirname, "../../../out", relative);
  return JSON.parse(fs.readFileSync(p, "utf8")).abi;
}

function toSolidityProof(proof) {
  const p = proof;
  const a = [BigInt(p.pi_a[0]), BigInt(p.pi_a[1])];
  const b = [
    [BigInt(p.pi_b[0][1]), BigInt(p.pi_b[0][0])],
    [BigInt(p.pi_b[1][1]), BigInt(p.pi_b[1][0])],
  ];
  const c = [BigInt(p.pi_c[0]), BigInt(p.pi_c[1])];
  return { a, b, c };
}

function randomAddress() {
  return `0x${crypto.randomBytes(20).toString("hex")}`;
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

async function getProof(backendUrl, wallet, pin, intent) {
  const nonceRes = await fetch(`${backendUrl}/api/zk/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: wallet, intent }),
  });
  const nonceJson = await nonceRes.json();
  if (!nonceRes.ok)
    throw new Error(`nonce error: ${nonceJson?.error || "unknown"}`);
  const { nonce } = nonceJson;
  const t0 = Date.now();
  const proofRes = await fetch(`${backendUrl}/api/zk/proof`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: wallet, pin, intent, nonce }),
  });
  const proofJson = await proofRes.json();
  const t1 = Date.now();
  if (!proofRes.ok)
    throw new Error(`proof error: ${proofJson?.error || "unknown"}`);
  return { proofJson, proofMs: t1 - t0 };
}

async function main() {
  const {
    rpc,
    privateKey,
    registry,
    backendUrl,
    wallet,
    pin,
    intent,
    captureMs,
    runs,
  } = parseArgs();
  if (!rpc || !privateKey || !registry)
    throw new Error("Missing --rpc/--privateKey/--registry");
  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet))
    throw new Error("Missing/invalid --wallet");
  if (!pin || !/^\d{6}$/.test(pin)) throw new Error("Missing/invalid --pin");

  const walletClient = createWalletClient({
    transport: http(rpc),
    account: privateKeyToAccount(privateKey),
  });
  const publicClient = createPublicClient({ transport: http(rpc) });
  const registryAbi = loadAbi("Registry.sol/Registry.json");

  const totals = [];
  const captureTimes = [];
  const proofTimes = [];
  const submissionTimes = [];
  const confirmationTimes = [];

  for (let i = 0; i < runs; i++) {
    const tStart = Date.now();

    // Capture (simulated)
    const tCap0 = Date.now();
    if (captureMs > 0) await sleep(captureMs);
    const tCap1 = Date.now();

    // Proof generation via backend
    // Choose wallet: prefer unregistered to avoid revert
    let targetWallet = wallet;
    try {
      const existing = await publicClient.readContract({
        address: registry,
        abi: registryAbi,
        functionName: "getCredentialHash",
        args: [BigInt(wallet)],
      });
      if (BigInt(existing) !== 0n) {
        targetWallet = randomAddress();
      }
    } catch {
      // ignore
    }

    const { proofJson, proofMs } = await getProof(
      backendUrl,
      targetWallet,
      pin,
      intent
    );
    const { proof, publicSignals } = proofJson;
    const { a, b, c } = toSolidityProof(proof);
    const [walletPS, intentPS, ch, nonce, rh] = publicSignals.map((x) =>
      BigInt(x)
    );

    // Submission (send tx)
    const tSub0 = Date.now();
    const hash = await walletClient.writeContract({
      address: registry,
      abi: registryAbi,
      functionName: "register",
      args: [a, b, c, walletPS, intentPS, ch, nonce, rh],
    });
    const tSub1 = Date.now();

    // Confirmation
    const tConf0 = Date.now();
    await publicClient.waitForTransactionReceipt({ hash });
    const tConf1 = Date.now();

    const tEnd = Date.now();
    totals.push(tEnd - tStart);
    captureTimes.push(tCap1 - tCap0);
    proofTimes.push(proofMs);
    submissionTimes.push(tSub1 - tSub0);
    confirmationTimes.push(tConf1 - tConf0);
  }

  const out = {
    runs,
    totals: {
      medianMs: percentile(totals, 50),
      p95Ms: percentile(totals, 95),
      targetTotalLtMs: 8000,
    },
    stages: {
      capture: {
        medianMs: percentile(captureTimes, 50),
        p95Ms: percentile(captureTimes, 95),
      },
      proofGen: {
        medianMs: percentile(proofTimes, 50),
        p95Ms: percentile(proofTimes, 95),
      },
      submission: {
        medianMs: percentile(submissionTimes, 50),
        p95Ms: percentile(submissionTimes, 95),
      },
      confirmation: {
        medianMs: percentile(confirmationTimes, 50),
        p95Ms: percentile(confirmationTimes, 95),
      },
    },
  };
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
