import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { baseUrl, apiKey } = await req.json();
  if (!baseUrl || !apiKey) {
    return NextResponse.json({ error: "baseUrl and apiKey required" }, { status: 400 });
  }
  const url = baseUrl.replace(/\/$/, "") + "/models";
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      return NextResponse.json({ error: `upstream ${res.status}` }, { status: res.status });
    }
    const data = await res.json();
    const models = (data.data || data.models || []).map((m: any) => ({
      id: m.id || m.name || m.model,
      name: m.id || m.name || m.model,
    }));
    return NextResponse.json({ models });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}