#!/usr/bin/env node
/**
 * On-chain verification latency benchmark
 * Measures block inclusion time for Registry.register (and optionally Delegation.agree)
 *
 * Usage:
 *   node scripts/perf/onchain-verify-bench.js \
 *     --rpc https://arb-sepolia.g.alchemy.com/v2/KEY \
 *     --privateKey 0x... \
 *     --registry 0x... \
 *     --backendUrl http://localhost:8787 \
 *     --wallet 0x... \
 *     --pin 123456 \
 *     --runs 10
 *
 * Optional Delegation:
 *     --delegation 0x... --to 0x... --token 0x... --amount 1000000
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path");
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config({
  path: path.resolve(__dirname, "../../.env.local"),
});
const {
  createWalletClient,
  createPublicClient,
  http,
  parseAbi,
// eslint-disable-next-line @typescript-eslint/no-require-imports
} = require("viem");
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
    delegation: args.delegation || process.env.EIP7702_AUTHORITY_ADDRESS || "",
    to: args.to || process.env.NEXT_PUBLIC_MERCHANT_ADDRESS || "",
    token: args.token || process.env.NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS || "",
    amount: args.amount || "",
    backendUrl:
      args.backendUrl ||
      process.env.NEXT_PUBLIC_ZK_BACKEND_URL ||
      "http://localhost:8787",
    wallet: args.wallet || process.env.NEXT_PUBLIC_MERCHANT_ADDRESS,
    pin: args.pin || "123456",
    intent: Number(args.intent || process.env.PERF_INTENT || 0),
    runs: Number(args.runs || process.env.PERF_ONCHAIN_RUNS || 10),
  };
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
  const proofRes = await fetch(`${backendUrl}/api/zk/proof`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: wallet, pin, intent, nonce }),
  });
  const proofJson = await proofRes.json();
  if (!proofRes.ok)
    throw new Error(`proof error: ${proofJson?.error || "unknown"}`);
  return proofJson;
}

function loadAbi(relative) {
  const p = path.resolve(__dirname, "../../../out", relative);
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  return j.abi;
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

async function main() {
  const {
    rpc,
    privateKey,
    registry,
    delegation,
    to,
    token,
    amount,
    backendUrl,
    wallet,
    pin,
    intent,
    runs,
  } = parseArgs();

  if (!rpc || !privateKey || !registry)
    throw new Error("Missing --rpc/--privateKey/--registry");
  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet))
    throw new Error("Missing/invalid --wallet");
  if (!pin || !/^\d{6}$/.test(pin)) throw new Error("Missing/invalid --pin");
  if (!Number.isFinite(runs) || runs <= 0)
    throw new Error("--runs must be positive");

  const walletClient = createWalletClient({
    transport: http(rpc),
    account: privateKeyToAccount(privateKey),
  });
  const publicClient = createPublicClient({ transport: http(rpc) });
  const registryAbi = loadAbi("Registry.sol/Registry.json");
  const delegationAbi = delegation
    ? loadAbi("Delegation.sol/Delegation.json")
    : null;
  const ERC20_ABI = parseAbi([
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
  ]);

  const inclusionLatenciesMs = [];
  const inclusionLatenciesMsDelegation = [];
  const gasUsedRegister = [];
  const gasUsedDelegation = [];

  for (let i = 0; i < runs; i++) {
    // Pick a wallet that is not yet registered to avoid revert
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
      // If read fails, fallback to provided wallet
    }

    const proofJson = await getProof(backendUrl, targetWallet, pin, intent);
    const { proof, publicSignals } = proofJson;
    const { a, b, c } = toSolidityProof(proof);
    const [walletPS, intentPS, ch, nonce, rh] = publicSignals.map((x) =>
      BigInt(x)
    );

    // Registry.register
    const tSubmit = Date.now();
    const hash = await walletClient.writeContract({
      address: registry,
      abi: registryAbi,
      functionName: "register",
      args: [a, b, c, walletPS, intentPS, ch, nonce, rh],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const tMined = Date.now();
    inclusionLatenciesMs.push(tMined - tSubmit);
    gasUsedRegister.push(Number(receipt.gasUsed));

    // Decide delegation params:
    // - If explicit flags provided, use them
    // - Else, if delegation address is set, auto-fill:
    //   from = NEXT_PUBLIC_MERCHANT_ADDRESS (env) or signer address
    //   to   = random address
    //   token= NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS (env)
    //   amount = 1_000_000 (1 USDC 6dp)
    const signerAddrs = await walletClient.getAddresses();
    const signer = signerAddrs[0];
    const autoFrom =
      process.env.NEXT_PUBLIC_MERCHANT_ADDRESS &&
      /^0x[0-9a-fA-F]{40}$/.test(process.env.NEXT_PUBLIC_MERCHANT_ADDRESS)
        ? process.env.NEXT_PUBLIC_MERCHANT_ADDRESS
        : signer;
    const autoToken =
      token && /^0x[0-9a-fA-F]{40}$/.test(token)
        ? token
        : process.env.NEXT_PUBLIC_PAYMENT_TOKEN_ADDRESS;
    // Default to self-transfer if no explicit 'to' provided
    const autoTo = to && /^0x[0-9a-fA-F]{40}$/.test(to) ? to : autoFrom;
    const autoAmount =
      amount && /^\d+$/.test(String(amount)) ? amount : "1000000";

    if (delegation && autoToken) {
      // Ensure allowance; if insufficient, approve first (owner = autoFrom)
      try {
        const allowance = await publicClient.readContract({
          address: autoToken,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [autoFrom, delegation],
        });
        if (BigInt(allowance) < BigInt(autoAmount)) {
          const max = 2n ** 256n - 1n;
          await publicClient.waitForTransactionReceipt({
            hash: await walletClient.writeContract({
              address: autoToken,
              abi: ERC20_ABI,
              functionName: "approve",
              args: [delegation, max],
            }),
          });
        }
      } catch {
        // If allowance check fails, attempt anyway
      }
      // Generate a fresh proof for delegation (new nonce); do NOT reuse the register proof
      const proofJson2 = await getProof(backendUrl, targetWallet, pin, intent);
      const { proof: proof2, publicSignals: publicSignals2 } = proofJson2;
      const { a: a2, b: b2, c: c2 } = toSolidityProof(proof2);
      const [walletPS2, intentPS2, ch2, nonce2, rh2] = publicSignals2.map((x) =>
        BigInt(x)
      );
      const tSubmitD = Date.now();
      const hashD = await walletClient.writeContract({
        address: delegation,
        abi: delegationAbi,
        functionName: "agree",
        args: [
          a2,
          b2,
          c2,
          walletPS2,
          intentPS2,
          ch2,
          nonce2,
          rh2,
          autoFrom,
          autoTo,
          autoToken,
          BigInt(autoAmount),
        ],
      });
      const receiptD = await publicClient.waitForTransactionReceipt({
        hash: hashD,
      });
      const tMinedD = Date.now();
      inclusionLatenciesMsDelegation.push(tMinedD - tSubmitD);
      gasUsedDelegation.push(Number(receiptD.gasUsed));
    } else if (delegation) {
      console.info(
        "[onchain-bench] Delegation address set but missing to/token/amount; skipping delegation run."
      );
    }
  }

  const regMedian = percentile(inclusionLatenciesMs, 50);
  const regP95 = percentile(inclusionLatenciesMs, 95);
  const out = {
    registry: {
      runs,
      medianInclusionMs: Number(regMedian.toFixed(2)),
      p95InclusionMs: Number(regP95.toFixed(2)),
      targetInclusionLtMs: 5000,
      gasUsed: {
        min: Math.min(...gasUsedRegister),
        max: Math.max(...gasUsedRegister),
        median: percentile(gasUsedRegister, 50),
        p95: percentile(gasUsedRegister, 95),
      },
    },
  };
  if (delegation) {
    const delMedian = percentile(inclusionLatenciesMsDelegation, 50);
    const delP95 = percentile(inclusionLatenciesMsDelegation, 95);
    out.delegation = {
      runs,
      medianInclusionMs: Number(delMedian.toFixed(2)),
      p95InclusionMs: Number(delP95.toFixed(2)),
      targetInclusionLtMs: 5000,
      gasUsed: {
        min: Math.min(...gasUsedDelegation),
        max: Math.max(...gasUsedDelegation),
        median: percentile(gasUsedDelegation, 50),
        p95: percentile(gasUsedDelegation, 95),
      },
    };
  }
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
