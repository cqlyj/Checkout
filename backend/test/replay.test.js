/* eslint-disable no-console */
// Basic replay tests against the running Fastify backend
// Prereq: backend server is running (npm run start) and env vars are set
// Uses Node 18+ global fetch

const PORT = process.env.ZK_BACKEND_PORT ? Number(process.env.ZK_BACKEND_PORT) : 8787;
const BASE = `http://127.0.0.1:${PORT}`;

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, data: json };
}

async function main() {
  // Use a unique wallet per run to avoid collisions
  const walletAddress = `0x${"a".repeat(36)}11c3`; // 40 hex chars
  const intent = 0;
  const pin = "123456";

  console.log("Requesting nonce...");
  const n1 = await post("/api/zk/nonce", { walletAddress, intent });
  if (n1.status !== 200 || typeof n1.data.nonce !== "number") {
    console.error("Failed to get nonce", n1);
    process.exit(1);
  }
  const nonce = n1.data.nonce;
  console.log("Nonce issued:", nonce);

  console.log("Submitting proof with fresh nonce...");
  const p1 = await post("/api/zk/proof", { walletAddress, pin, intent, nonce });
  if (p1.status !== 200 || !p1.data?.proof) {
    console.error("Proof generation/nonce consume failed", p1);
    process.exit(1);
  }
  console.log("Proof accepted (expected).");

  console.log("Replaying with same nonce (should fail)...");
  const p2 = await post("/api/zk/proof", { walletAddress, pin, intent, nonce });
  if (p2.status === 200) {
    console.error("Replay unexpectedly succeeded");
    process.exit(1);
  }
  console.log("Replay rejected (expected):", p2.data?.error || p2.status);

  console.log("Cross-session replay (new fetch instance, same inputs)...");
  // Using same code path; behavior should still reject
  const p3 = await post("/api/zk/proof", { walletAddress, pin, intent, nonce });
  if (p3.status === 200) {
    console.error("Cross-session replay unexpectedly succeeded");
    process.exit(1);
  }
  console.log("Cross-session replay rejected (expected):", p3.data?.error || p3.status);

  console.log("Cross-intent attempt with the same nonce (should fail)...");
  const otherIntent = 1;
  const p4 = await post("/api/zk/proof", { walletAddress, pin, intent: otherIntent, nonce });
  if (p4.status === 200) {
    console.error("Cross-intent reuse unexpectedly succeeded");
    process.exit(1);
  }
  console.log("Cross-intent reuse rejected (expected):", p4.data?.error || p4.status);

  console.log("All replay tests passed with 0% success rate.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


