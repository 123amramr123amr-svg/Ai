import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { baseUrl, apiKey, model } = await req.json();
  if (!baseUrl || !apiKey || !model) {
    return NextResponse.json({ error: "baseUrl, apiKey, model required" }, { status: 400 });
  }
  const url = baseUrl.replace(/\/$/, "") + "/chat/completions";
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 8,
      }),
    });
    const latency = Date.now() - start;
    if (!res.ok) {
      return NextResponse.json({ error: `upstream ${res.status}`, latency }, { status: res.status });
    }
    await res.json();
    return NextResponse.json({ latency, ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, latency: Date.now() - start }, { status: 500 });
  }
}