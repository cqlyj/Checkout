// Generate realistic mock embeddings dataset for biometric evaluation.
// - Reads a base embedding from a JSON file (e.g. scripts/base-embedding.json)
// - Creates multiple users with samples around distinct centroids
// - Creates impostor samples far from enrolled centroids
//
// Usage:
//   node scripts/generate-embeddings.js --out ./biometric_data --users 5 --samples 30 --impostors 10 --base scripts/base-embedding.json
//
// Notes:
// - All vectors are L2-normalized; cosine similarity is stable.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path");

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {
    outDir: "./mock_data/biometric",
    users: 10,
    samples: 40,
    impostors: 50,
    baseFile: "scripts/base-embedding.json",
    seed: 1337,
    centroidShift: 0.78, // separation between users
    genuineStd: 0.02, // realistic noise for genuine
    impostorStd: 0.06, // broader noise for impostors
    pushFromAvg: 0.9, // push impostor anchor away from enrolled avg
    impostorNearFrac: 0.02,
    impostorNearShift: 0.14,
    impostorNearStd: 0.02,
    spoofGoodFrac: 0.04,
    spoofGoodShift: 0.12,
    spoofGoodStd: 0.012,
    spoofBadShift: 0.35,
    spoofBadStd: 0.06,
    genuineHardFrac: 0.5,
    genuineHardStd: 0.05,
    genuineHardShift: 0.25,
  };
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i];
    const v = args[i + 1];
    if (!k || v === undefined) continue;
    if (k === "--out") out.outDir = v;
    else if (k === "--users") out.users = Number(v);
    else if (k === "--samples") out.samples = Number(v);
    else if (k === "--impostors") out.impostors = Number(v);
    else if (k === "--base") out.baseFile = v;
    else if (k === "--seed") out.seed = Number(v);
    else if (k === "--centroidShift") out.centroidShift = Number(v);
    else if (k === "--genuineStd") out.genuineStd = Number(v);
    else if (k === "--impostorStd") out.impostorStd = Number(v);
    else if (k === "--pushFromAvg") out.pushFromAvg = Number(v);
    else if (k === "--impostorNearFrac") out.impostorNearFrac = Number(v);
    else if (k === "--impostorNearShift") out.impostorNearShift = Number(v);
    else if (k === "--impostorNearStd") out.impostorNearStd = Number(v);
    else if (k === "--spoofStd") out.spoofStd = Number(v);
    else if (k === "--spoofShift") out.spoofShift = Number(v);
    else if (k === "--spoofGoodFrac") out.spoofGoodFrac = Number(v);
    else if (k === "--spoofGoodShift") out.spoofGoodShift = Number(v);
    else if (k === "--spoofGoodStd") out.spoofGoodStd = Number(v);
    else if (k === "--spoofBadShift") out.spoofBadShift = Number(v);
    else if (k === "--spoofBadStd") out.spoofBadStd = Number(v);
    else if (k === "--genuineHardFrac") out.genuineHardFrac = Number(v);
    else if (k === "--genuineHardStd") out.genuineHardStd = Number(v);
    else if (k === "--genuineHardShift") out.genuineHardShift = Number(v);
  }
  return out;
}

// Simple deterministic PRNG (xorshift)
function makeRand(seed) {
  let x = seed >>> 0;
  return function rand() {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 0xffffffff;
  };
}

function gaussian(rand) {
  // Box-Muller
  let u = 0,
    v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function l2norm(vec) {
  let s = 0;
  for (const x of vec) s += x * x;
  const n = Math.sqrt(s) || 1;
  return vec.map((x) => x / n);
}

function addNoise(vec, std, rand) {
  const out = new Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    out[i] = vec[i] + std * gaussian(rand);
  }
  return l2norm(out);
}

function shiftVector(vec, magnitude, rand) {
  // Apply a small random shift orthogonal-ish to the vector
  const noise = new Array(vec.length);
  for (let i = 0; i < vec.length; i++) noise[i] = gaussian(rand);
  // Normalize noise
  const nNoise = l2norm(noise);
  // Combine and renormalize
  const out = new Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] + magnitude * nNoise[i];
  return l2norm(out);
}

function generate() {
  const cfg = parseArgs();
  const rand = makeRand(cfg.seed || 1337);
  const base = JSON.parse(fs.readFileSync(path.resolve(cfg.baseFile), "utf-8"));
  const dim = base.length;
  const baseNorm = l2norm(base);

  const root = path.resolve(cfg.outDir);
  const genDir = path.join(root, "genuine");
  const impDir = path.join(root, "impostors");
  const spoofDir = path.join(root, "spoof");
  fs.mkdirSync(genDir, { recursive: true });
  fs.mkdirSync(impDir, { recursive: true });
  fs.mkdirSync(spoofDir, { recursive: true });

  // User centroids: start from base, create well-separated centroids
  const centroids = [];
  for (let u = 0; u < cfg.users; u++) {
    // Spread centroids by shifting base so inter-user similarity ~ (1 - small)
    const centroid = shiftVector(baseNorm, cfg.centroidShift + 0.02 * u, rand);
    centroids.push(centroid);
  }

  // Spoof samples: per enrolled user, generate replay-like samples near centroid but degraded
  for (let u = 0; u < cfg.users; u++) {
    const samples = [];
    const nSamples = Math.max(20, Math.floor(cfg.samples * 0.6));
    for (let i = 0; i < nSamples; i++) {
      // Mixture: some spoof attempts are "good" (closer to centroid), others "bad" (further)
      const isGood = rand() < (cfg.spoofGoodFrac ?? 0.04);
      const shift = isGood
        ? cfg.spoofGoodShift ?? 0.12
        : cfg.spoofBadShift ?? 0.35;
      const std = isGood ? cfg.spoofGoodStd ?? 0.012 : cfg.spoofBadStd ?? 0.06;
      const around = shiftVector(centroids[u], shift, rand);
      samples.push(addNoise(around, std, rand));
    }
    fs.writeFileSync(
      path.join(spoofDir, `user${u + 1}.json`),
      JSON.stringify(samples)
    );
  }

  // Genuine samples per user: tight noise around centroid => high intra-user sim (~0.9)
  for (let u = 0; u < cfg.users; u++) {
    const samples = [];
    for (let i = 0; i < cfg.samples; i++) {
      const hardStart = Math.floor(
        cfg.samples * (1 - (cfg.genuineHardFrac ?? 0.5))
      );
      const stdHere =
        i >= hardStart ? cfg.genuineHardStd ?? 0.05 : cfg.genuineStd;
      if (i >= hardStart) {
        const around = shiftVector(
          centroids[u],
          cfg.genuineHardShift ?? 0.25,
          rand
        );
        samples.push(addNoise(around, stdHere, rand));
      } else {
        samples.push(addNoise(centroids[u], stdHere, rand));
      }
    }
    fs.writeFileSync(
      path.join(genDir, `user${u + 1}.json`),
      JSON.stringify(samples)
    );
  }

  // Impostor samples: draw around vectors far from all centroids => low sim (~0.4–0.6)
  for (let k = 0; k < cfg.impostors; k++) {
    const samples = [];
    const nSamples = Math.max(10, Math.floor(cfg.samples * 0.5));
    for (let i = 0; i < nSamples; i++) {
      const isNear = rand() < (cfg.impostorNearFrac ?? 0.02);
      if (isNear) {
        // Choose a random enrolled user's centroid and generate a near-enrolled impostor
        const uIdx = Math.floor(rand() * centroids.length) % centroids.length;
        const around = shiftVector(
          centroids[uIdx],
          cfg.impostorNearShift ?? 0.14,
          rand
        );
        samples.push(addNoise(around, cfg.impostorNearStd ?? 0.02, rand));
      } else {
        // Build an impostor anchor roughly orthogonal to average centroid and push away
        let anchor = new Array(dim).fill(0).map(() => gaussian(rand));
        anchor = l2norm(anchor);
        const avg = centroids[0].map(
          (_, j) => centroids.reduce((s, c) => s + c[j], 0) / centroids.length
        );
        const avgNorm = l2norm(avg);
        for (let j = 0; j < dim; j++)
          anchor[j] = anchor[j] - (cfg.pushFromAvg ?? 0.9) * avgNorm[j];
        anchor = l2norm(anchor);
        samples.push(addNoise(anchor, cfg.impostorStd, rand));
      }
    }
    fs.writeFileSync(
      path.join(impDir, `imp${k + 1}.json`),
      JSON.stringify(samples)
    );
  }

  console.log(
    `Generated users=${cfg.users} samples=${cfg.samples}/user impostors=${cfg.impostors} at ${cfg.outDir}`
  );
}

generate();
