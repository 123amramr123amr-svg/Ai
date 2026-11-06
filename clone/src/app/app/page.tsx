"use client";
import { useState } from "react";

export default function AppPage() {
  const [prompt, setPrompt] = useState("");
  const [tasks, setTasks] = useState<{ id: string; prompt: string }[]>([]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setTasks((t) => [{ id: crypto.randomUUID(), prompt }, ...t]);
    setPrompt("");
  }

  return (
    <main className="min-h-screen bg-black text-white flex">
      <aside className="w-64 border-r border-neutral-800 p-4 hidden md:block">
        <div className="font-bold mb-4">Manus Clone</div>
        <nav className="space-y-2 text-sm text-neutral-300">
          <div>Tasks</div>
          <div>Projects</div>
          <div>Connectors</div>
          <div>Automations</div>
        </nav>
      </aside>
      <section className="flex-1 p-6">
        <form onSubmit={submit} className="max-w-3xl mx-auto">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="What can I do for you?"
            className="w-full h-32 rounded-2xl bg-neutral-900 border border-neutral-700 p-4 focus:outline-none focus:border-indigo-500"
          />
          <button className="mt-3 bg-indigo-600 px-6 py-2 rounded-lg">Run</button>
        </form>
        <div className="max-w-3xl mx-auto mt-8 space-y-3">
          {tasks.map((t) => (
            <div key={t.id} className="rounded-xl bg-neutral-900 border border-neutral-800 p-4">
              <div className="text-sm text-neutral-400">Task</div>
              <div>{t.prompt}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}