import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/serverClient";

type RegisterBody = {
  walletAddressHex: string; // checksummed 0x...40 hex
  embedding: number[];
  embeddingDim: number;
  modelVersion: string;
  emailHashHex?: string; // optional 0x...64 hex
};

function hexToPgBytea(hex?: string | null): string | null {
  if (!hex) return null;
  const clean = (hex.startsWith("0x") ? hex.slice(2) : hex).toLowerCase();
  if (clean.length % 2 !== 0) throw new Error("Invalid hex length");
  return `\\x${clean}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RegisterBody;
    const {
      walletAddressHex,
      embedding,
      embeddingDim,
      modelVersion,
      emailHashHex,
    } = body;
    const missing: string[] = [];
    if (!walletAddressHex) missing.push("walletAddressHex");
    if (!embedding || !Array.isArray(embedding) || embedding.length === 0)
      missing.push("embedding");
    if (!embeddingDim || typeof embeddingDim !== "number" || embeddingDim <= 0)
      missing.push("embeddingDim");
    if (!modelVersion) missing.push("modelVersion");
    if (missing.length) {
      return NextResponse.json(
        { error: "Missing fields", missing },
        { status: 400 }
      );
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddressHex)) {
      return NextResponse.json(
        { error: "Invalid wallet address" },
        { status: 400 }
      );
    }
    if (emailHashHex && !/^0x[0-9a-fA-F]{64}$/.test(emailHashHex)) {
      return NextResponse.json(
        { error: "Invalid email hash" },
        { status: 400 }
      );
    }

    const walletBytesHex = hexToPgBytea(walletAddressHex);
    const emailBytesHex = hexToPgBytea(emailHashHex ?? null);

    const supabase = getSupabaseServerClient();
    const upsertPayload: {
      wallet_address_bytes: string | null;
      wallet_address_checksum: string;
      embedding: number[];
      embedding_dim: number;
      model_version: string;
      email_hash: string | null;
      updated_at: string;
    } = {
      wallet_address_bytes: walletBytesHex,
      wallet_address_checksum: walletAddressHex,
      embedding,
      embedding_dim: embeddingDim,
      model_version: modelVersion,
      email_hash: emailBytesHex,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("face_templates")
      .upsert(upsertPayload, {
        onConflict: "wallet_address_bytes",
      });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: (e as { message?: string })?.message ?? "Internal error" },
      { status: 500 }
    );
  }
}
