import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    console.log("[ClientDebug]", JSON.stringify(body));
  } catch (err) {
    console.error("[ClientDebug] Failed to parse log:", err);
  }
  return NextResponse.json({ ok: true });
}

