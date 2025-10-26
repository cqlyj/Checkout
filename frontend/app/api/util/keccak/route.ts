import { NextRequest, NextResponse } from "next/server";
import { keccak256 } from "viem";

export async function POST(req: NextRequest) {
  try {
    const { data } = (await req.json()) as { data: string };
    if (!data)
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    const enc = new TextEncoder();
    const bytes = enc.encode(data);
    const hash = keccak256(bytes);
    return NextResponse.json({ hash });
  } catch (e: unknown) {
    return NextResponse.json({ error: "Hash error" }, { status: 500 });
  }
}
