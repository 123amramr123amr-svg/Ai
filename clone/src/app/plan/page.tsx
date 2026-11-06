"use client";
import { useState } from "react";

export default function PlanPage() {
  const [prompt, setPrompt] = useState("");
  const [plan, setPlan] = useState("");
  const [approved, setApproved] = useState(false);
  const [running, setRunning] = useState(false);

  async function generate() {
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    const data = await res.json();
    setPlan(data.plan);
    setApproved(false);
  }

  return (
    <main className="min-h-screen bg-black text-white px-6 py-10 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold">Plan Mode</h1>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe a task..."
        className="w-full h-24 mt-4 rounded-lg bg-neutral-900 border border-neutral-700 p-3"
      />
      <button onClick={generate} className="mt-3 bg-indigo-600 px-5 py-2 rounded-lg">
        Generate plan
      </button>
      {plan && (
        <div className="mt-6 rounded-lg bg-neutral-900 border border-neutral-700 p-4 whitespace-pre-wrap">
          {plan}
        </div>
      )}
      {plan && (
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => setApproved(true)}
            className="bg-green-600 px-5 py-2 rounded-lg"
          >
            Approve
          </button>
          <button
            onClick={() => setRunning(true)}
            disabled={!approved}
            className="bg-indigo-600 px-5 py-2 rounded-lg disabled:opacity-50"
          >
            {running ? "Running..." : "Run (approved)"}
          </button>
        </div>
      )}
    </main>
  );
}