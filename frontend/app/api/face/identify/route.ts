import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/serverClient";

type IdentifyBody = {
  embedding: number[];
};

function cosineSimilarity(a: number[], b: number[]) {
  if (a.length !== b.length) return -1;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb) || 1;
  return dot / denom;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as IdentifyBody;
    const { embedding } = body;
    if (!embedding || !Array.isArray(embedding)) {
      return NextResponse.json({ error: "Missing embedding" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("face_templates")
      .select("wallet_address_checksum, embedding, embedding_dim, email_hash")
      .returns<
        {
          wallet_address_checksum: string;
          embedding: number[];
          embedding_dim: number;
          email_hash: string | null;
        }[]
      >();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    let best: { addr: string; score: number; hasEmailHash: boolean } | null =
      null;
    for (const row of data ?? []) {
      const emb = row.embedding as unknown as number[];
      if (!emb || emb.length !== embedding.length) continue;
      const score = cosineSimilarity(embedding, emb);
      if (!best || score > best.score) {
        best = {
          addr: row.wallet_address_checksum,
          score,
          hasEmailHash: !!row.email_hash,
        };
      }
    }

    if (!best) return NextResponse.json({ match: null });
    return NextResponse.json({
      match: best.addr,
      similarity: best.score,
      hasEmailHash: best.hasEmailHash,
    });
  } catch (e) {
    let errorMessage = "Internal error";
    if (e instanceof Error) {
      errorMessage = e.message;
    }
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
