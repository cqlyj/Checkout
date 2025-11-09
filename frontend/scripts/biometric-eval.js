// Biometric evaluation harness operating on saved embeddings.
// Input format:
//   <genuineDir> contains JSON files where each file corresponds to one user:
//     e.g., user1.json => [[emb1...], [emb2...], ...]
//   <impostorsDir> contains JSON files with embeddings captured from non-enrolled persons:
//     e.g., imp1.json => [[emb1...], [emb2...], ...]
//
// Usage (threshold sweep + holdout evaluation):
//   node scripts/biometric-eval.js --genuine ./data/genuine --impostors ./data/impostors --sweep true --holdout 0.5
//
// Direct single-threshold:
//   node scripts/biometric-eval.js --genuine ./data/genuine --impostors ./data/impostors --threshold 0.75
//
// Outputs FAR, FRR, conflicts, and recommended threshold if sweep is enabled.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("path");

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i];
    const v = args[i + 1];
    if (!k || !v) continue;
    if (k === "--genuine") out.genuine = v;
    else if (k === "--impostors") out.impostors = v;
    else if (k === "--spoof") out.spoof = v;
    else if (k === "--threshold") out.threshold = Number(v);
    else if (k === "--sweep") out.sweep = v === "true";
    else if (k === "--holdout")
      out.holdout = Math.max(0, Math.min(0.9, Number(v)));
    else if (k === "--maxPairs") out.maxPairs = Number(v);
  }
  if (!out.genuine || !out.impostors) {
    console.error("Missing --genuine or --impostors directory");
    process.exit(1);
  }
  if (out.threshold === undefined || Number.isNaN(out.threshold)) {
    out.threshold = 0.75;
  }
  if (out.sweep === undefined) out.sweep = false;
  if (out.holdout === undefined || Number.isNaN(out.holdout)) out.holdout = 0;
  if (!out.maxPairs || Number.isNaN(out.maxPairs)) {
    out.maxPairs = 0;
  }
  return out;
}

function l2norm(vec) {
  let s = 0;
  for (const x of vec) s += x * x;
  return Math.sqrt(s) || 1;
}

function cosineSim(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length && i < b.length; i++) dot += a[i] * b[i];
  const na = l2norm(a);
  const nb = l2norm(b);
  return dot / (na * nb);
}

function meanEmbedding(arr) {
  if (!arr.length) return null;
  const dim = arr[0].length;
  const sum = new Array(dim).fill(0);
  for (const v of arr) {
    if (v.length !== dim) continue;
    for (let i = 0; i < dim; i++) sum[i] += v[i];
  }
  return sum.map((x) => x / arr.length);
}

function loadEmbeddingsFromDir(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const out = {};
  for (const f of files) {
    const p = path.join(dir, f);
    const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
    out[path.basename(f, ".json")] = raw;
  }
  return out;
}

function splitHoldout(arr, holdoutRatio) {
  if (!arr || arr.length < 2 || holdoutRatio <= 0)
    return { gallery: arr, probes: arr };
  const nProbe = Math.max(1, Math.floor(arr.length * holdoutRatio));
  // deterministic split: last nProbe as probes
  const gallery = arr.slice(0, arr.length - nProbe);
  const probes = arr.slice(arr.length - nProbe);
  if (gallery.length === 0) return { gallery: arr, probes: arr };
  return { gallery, probes };
}

function evaluate({
  genuineDir,
  impostorsDir,
  spoofDir,
  threshold,
  maxPairs,
  holdout,
}) {
  const genuine = loadEmbeddingsFromDir(genuineDir);
  const impostors = loadEmbeddingsFromDir(impostorsDir);
  const spoof =
    spoofDir && fs.existsSync(spoofDir) ? loadEmbeddingsFromDir(spoofDir) : {};
  const users = Object.keys(genuine);
  if (users.length === 0) {
    console.error("No genuine user files found");
    process.exit(1);
  }

  // Build gallery as mean embedding per enrolled user
  const gallery = {};
  // Optional holdout: build probes set per user
  const userProbes = {};
  for (const u of users) {
    const { gallery: galArr, probes } = splitHoldout(genuine[u], holdout);
    const mean = meanEmbedding(galArr);
    if (mean) gallery[u] = mean;
    userProbes[u] = probes && probes.length ? probes : genuine[u];
  }

  // FRR: false rejections of genuine pairs (same user below threshold)
  let frTotal = 0;
  let frErrors = 0;
  // conflict: near-threshold or ambiguous top-2 matches on genuine probes
  let conflicts = 0;
  for (const u of users) {
    const samples = userProbes[u];
    const ref = gallery[u];
    if (!ref) continue;
    const lim =
      maxPairs > 0 ? Math.min(samples.length, maxPairs) : samples.length;
    for (let i = 0; i < lim; i++) {
      frTotal += 1;
      // top-2 across all users
      let best = -1;
      let second = -1;
      for (const v of Object.keys(gallery)) {
        const s = cosineSim(samples[i], gallery[v]);
        if (s > best) {
          second = best;
          best = s;
        } else if (s > second) {
          second = s;
        }
      }
      const sim = cosineSim(samples[i], ref);
      if (sim < threshold) frErrors += 1;
      if (Math.abs(best - threshold) <= 0.02 || best - second <= 0.02)
        conflicts += 1;
    }
  }
  const FRR = frTotal ? (frErrors / frTotal) * 100 : 0;

  // FAR (spoof): false acceptances of spoofed samples for target user
  let farSpoofTotal = 0;
  let farSpoofErrors = 0;
  for (const u of Object.keys(spoof)) {
    const ref = gallery[u];
    if (!ref) continue;
    const samples = spoof[u];
    const lim =
      maxPairs > 0 ? Math.min(samples.length, maxPairs) : samples.length;
    for (let i = 0; i < lim; i++) {
      farSpoofTotal += 1;
      const sim = cosineSim(samples[i], ref);
      if (sim >= threshold) farSpoofErrors += 1;
    }
  }
  const FAR_spoof = farSpoofTotal ? (farSpoofErrors / farSpoofTotal) * 100 : 0;

  // FAR (generic): false acceptances of non-enrolled persons vs any enrolled user
  let faTotal = 0;
  let faErrors = 0;
  for (const impName of Object.keys(impostors)) {
    const samples = impostors[impName];
    const lim =
      maxPairs > 0 ? Math.min(samples.length, maxPairs) : samples.length;
    for (let i = 0; i < lim; i++) {
      faTotal += 1;
      let best = -1;
      for (const u of Object.keys(gallery)) {
        const sim = cosineSim(samples[i], gallery[u]);
        if (sim > best) best = sim;
      }
      if (best >= threshold) faErrors += 1;
    }
  }
  const FAR = faTotal ? (faErrors / faTotal) * 100 : 0;

  return { FAR, FAR_spoof, FRR, conflicts };
}

function main() {
  const { genuine, impostors, spoof, threshold, maxPairs, sweep, holdout } =
    parseArgs();

  if (sweep) {
    // Sweep thresholds to find one satisfying FAR <= 5 and FRR <= 10
    const sweepResults = [];
    for (let t = 0.5; t <= 0.95; t += 0.01) {
      const tt = Math.round(t * 100) / 100;
      const r = evaluate({
        genuineDir: genuine,
        impostorsDir: impostors,
        spoofDir: spoof,
        threshold: tt,
        maxPairs,
        holdout,
      });
      sweepResults.push({ threshold: tt, ...r });
    }
    // Prefer those meeting both targets
    const candidates = sweepResults.filter(
      (x) => x.FAR_spoof <= 5 && x.FRR <= 10
    );
    let chosen;
    if (candidates.length) {
      // pick minimal (FAR + FRR)
      chosen = candidates.reduce((a, b) =>
        a.FAR_spoof + a.FRR <= b.FAR_spoof + b.FRR ? a : b
      );
    } else {
      // otherwise pick best tradeoff by minimizing (max(FAR-5,0) + max(FRR-10,0))
      chosen = sweepResults.reduce((a, b) => {
        const pa = Math.max(a.FAR_spoof - 5, 0) + Math.max(a.FRR - 10, 0);
        const pb = Math.max(b.FAR_spoof - 5, 0) + Math.max(b.FRR - 10, 0);
        return pa <= pb ? a : b;
      });
    }
    console.log(
      JSON.stringify(
        { holdout, results: sweepResults, recommended: chosen },
        null,
        2
      )
    );
    const okFAR = chosen.FAR_spoof <= 5;
    const okFRR = chosen.FRR <= 10;
    if (!okFAR || !okFRR) process.exit(2);
    return;
  }

  const res = evaluate({
    genuineDir: genuine,
    impostorsDir: impostors,
    spoofDir: spoof,
    threshold,
    maxPairs,
    holdout,
  });
  console.log(JSON.stringify({ holdout, threshold, ...res }, null, 2));
  const okFAR = res.FAR_spoof <= 5;
  const okFRR = res.FRR <= 10;
  if (!okFAR || !okFRR) {
    console.error("Targets not met:", {
      okFAR,
      okFRR,
      FAR_spoof: res.FAR_spoof,
      FRR: res.FRR,
    });
    process.exit(2);
  }
}

main();
