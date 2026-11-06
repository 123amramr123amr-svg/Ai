"use client";
import { useState } from "react";

const PROVIDERS = ["Gmail", "Google Drive", "Slack", "GitHub", "Notion", "Supabase"];

export default function ConnectorsPage() {
  const [connected, setConnected] = useState<Record<string, { on: boolean; readOnly: boolean }>>({});

  function toggle(p: string) {
    setConnected((c) => ({
      ...c,
      [p]: { on: !c[p]?.on, readOnly: c[p]?.readOnly ?? true },
    }));
  }
  function setReadOnly(p: string, v: boolean) {
    setConnected((c) => ({ ...c, [p]: { ...c[p], readOnly: v } }));
  }

  return (
    <main className="min-h-screen bg-black text-white px-6 py-10 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold">Connectors</h1>
      <p className="text-neutral-400 text-sm mt-2">
        Connect apps. Default scope is read-only for safety (no writes without explicit approval).
      </p>
      <ul className="mt-6 space-y-3">
        {PROVIDERS.map((p) => {
          const c = connected[p];
          return (
            <li key={p} className="rounded-lg bg-neutral-900 border border-neutral-700 p-4 flex items-center justify-between">
              <div>
                <div className="font-semibold">{p}</div>
                <label className="text-sm text-neutral-400 flex items-center gap-2 mt-1">
                  <input
                    type="checkbox"
                    checked={c?.readOnly ?? true}
                    onChange={(e) => setReadOnly(p, e.target.checked)}
                  />
                  Read-only scope
                </label>
              </div>
              <button
                onClick={() => toggle(p)}
                className={`px-4 py-2 rounded-lg ${c?.on ? "bg-green-600" : "bg-neutral-700"}`}
              >
                {c?.on ? "Connected" : "Connect"}
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}