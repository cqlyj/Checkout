"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type FaceCaptureProps = {
  onCaptured: (args: {
    embedding: number[];
    embeddingDim: number;
    modelVersion: string;
  }) => void;
  samples?: number; // number of frames to average
};

// Minimal face capture that attempts to average N embeddings using Human.js
// Gracefully degrades if Human.js is not installed
type HumanCtor = new (config?: unknown) => {
  warmup: () => Promise<void>;
  detect: (input: HTMLVideoElement) => Promise<unknown>;
};

type HumanModule = { default?: HumanCtor; Human?: HumanCtor } | null;

type DetectResult = {
  face?: Array<{
    embedding?: number[];
    score?: number;
  }>;
};

export function FaceCapture({ onCaptured, samples = 16 }: FaceCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<string>("Initializing camera...");
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [supported, setSupported] = useState<boolean>(true);

  const start = useCallback(async () => {
    if (isCapturing) return;
    setIsCapturing(true);
    try {
      // Lazy import Human browser ESM build to avoid tfjs-node on Next.js
      const humanModule = (await import("@vladmandic/human").catch(
        () => null
      )) as HumanModule;
      if (!humanModule) {
        setSupported(false);
        setStatus("Human.js not installed. Please add @vladmandic/human.");
        setIsCapturing(false);
        return;
      }
      const Human: HumanCtor | undefined =
        humanModule.default || humanModule.Human;
      if (!Human) {
        setSupported(false);
        setStatus("Human.js module not found.");
        setIsCapturing(false);
        return;
      }
      const human = new Human({
        cacheSensitivity: 0,
        warmup: "face",
        // Explicit CDN path to avoid undefined errors in load()
        modelBasePath: "https://cdn.jsdelivr.net/npm/@vladmandic/human/models",
        face: {
          enabled: true,
          detector: { enabled: true, rotation: true, maxDetected: 1 },
          mesh: { enabled: false },
          attention: { enabled: false },
          iris: { enabled: false },
          // description model is required for embeddings (faceres)
          description: { enabled: true },
          antispoof: { enabled: false },
          liveness: { enabled: false },
          // critical: get embeddings for recognition
          embedding: { enabled: true },
        },
      });

      if (!(window.isSecureContext || location.hostname === "localhost")) {
        setStatus("Camera requires HTTPS or localhost.");
        setIsCapturing(false);
        return;
      }

      setStatus("Loading models...");
      // Ensure models are loaded explicitly before warmup/detect
      const maybeHuman = human as unknown as { load?: () => Promise<void> };
      if (typeof maybeHuman.load === "function") {
        await maybeHuman.load();
      }

      setStatus("Starting camera...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      await human.warmup();

      const collected: number[][] = [];
      let attempts = 0;
      setStatus("Looking for face...");
      while (collected.length < samples && attempts < samples * 10) {
        attempts += 1;
        if (!videoRef.current) break;
        const res = (await human.detect(videoRef.current)) as DetectResult;
        const face = res?.face?.[0];
        const score = typeof face?.score === "number" ? face.score : 0;
        if (face?.embedding && score > 0.6) {
          collected.push(Array.from(face.embedding as number[]));
          setStatus(`Collected ${collected.length}/${samples} samples...`);
        }
        // small delay
        await new Promise((r) => setTimeout(r, 80));
      }

      if (collected.length === 0) {
        setStatus("No face embedding captured. Try again.");
        setIsCapturing(false);
        return;
      }

      // average embeddings
      const dim = collected[0].length;
      const sum = new Array(dim).fill(0);
      for (const emb of collected) {
        if (emb.length !== dim) continue;
        for (let i = 0; i < dim; i++) sum[i] += emb[i];
      }
      const avg = sum.map((v) => v / collected.length);
      // L2 normalize
      const norm = Math.sqrt(avg.reduce((acc, v) => acc + v * v, 0)) || 1;
      const normalized = avg.map((v) => v / norm);

      onCaptured({
        embedding: normalized,
        embeddingDim: dim,
        modelVersion: "human-face-v1",
      });
      setStatus("Captured successfully.");
      setIsCapturing(false);
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      setStatus(
        `Camera or capture error: ${err?.name ?? "Error"}$${
          err?.message ? " - " + err.message : ""
        }`
      );
      setIsCapturing(false);
    }
  }, [isCapturing, onCaptured, samples]);

  useEffect(() => {
    if (!navigator?.mediaDevices?.getUserMedia) {
      setSupported(false);
      setStatus("Camera API not supported.");
    }
    return () => {
      // cleanup: stop camera if active
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
      } catch {}
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-64 w-64 rounded-full overflow-hidden bg-gray-100 border border-gray-200 shadow">
        <video
          ref={videoRef}
          playsInline
          muted
          className="h-full w-full object-cover"
        />
        {!supported && (
          <div className="absolute inset-0 flex items-center justify-center text-center text-sm text-gray-600 p-4">
            {status}
          </div>
        )}
      </div>
      <div className="text-sm text-gray-600 min-h-5">{status}</div>
      <button
        onClick={start}
        disabled={isCapturing || !supported}
        className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-6 py-3 text-white font-semibold shadow transition-all duration-150 hover:bg-indigo-700 disabled:opacity-50"
      >
        {isCapturing ? "Scanning..." : "Start scan"}
      </button>
    </div>
  );
}
