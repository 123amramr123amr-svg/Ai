"use client";
import { useState } from "react";

type Model = { id: string; name: string; speed?: number };

export default function ModelsPage() {
  const [baseUrl, setBaseUrl] = useState("https://api.openai.com/v1");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function fetchModels() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/models/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "fetch failed");
      setModels(data.models.map((m: any) => ({ ...m })));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function testSpeed(model: string) {
    const res = await fetch("/api/models/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl, apiKey, model }),
    });
    const data = await res.json();
    setModels((ms) =>
      ms.map((m) => (m.id === model ? { ...m, speed: data.latency } : m))
    );
  }

  async function testAll() {
    for (const m of models) await testSpeed(m.id);
  }

  return (
    <main className="min-h-screen bg-black text-white px-6 py-10 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold">Custom Models</h1>
      <p className="text-neutral-400 text-sm mt-2">
        Add your own OpenAI-compatible endpoint. Link first, then key, then fetch.
      </p>

      <div className="mt-6 space-y-3">
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://api.openai.com/v1"
          className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-4 py-2"
        />
        <input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="API key"
          type="password"
          className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-4 py-2"
        />
        <div className="flex gap-3">
          <button
            onClick={fetchModels}
            disabled={loading}
            className="bg-indigo-600 px-5 py-2 rounded-lg disabled:opacity-50"
          >
            {loading ? "Fetching..." : "جلب النموذج"}
          </button>
          <button onClick={testAll} className="bg-neutral-800 px-5 py-2 rounded-lg">
            Test all speeds
          </button>
        </div>
        {error && <div className="text-red-400 text-sm">{error}</div>}
      </div>

      <ul className="mt-8 space-y-2">
        {models.map((m) => (
          <li key={m.id} className="flex items-center justify-between rounded-lg bg-neutral-900 border border-neutral-800 px-4 py-3">
            <span>{m.name}</span>
            <span className="text-sm text-neutral-400">
              {m.speed ? `${m.speed} ms` : "—"}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}