"use client";
import { useState } from "react";

type Auto = { id: string; name: string; trigger: string; schedule: string; prompt: string; enabled: boolean };

export default function AutomationsPage() {
  const [items, setItems] = useState<Auto[]>([]);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("schedule");
  const [schedule, setSchedule] = useState("daily");
  const [prompt, setPrompt] = useState("");

  function create() {
    if (!name.trim()) return;
    setItems((a) => [
      { id: crypto.randomUUID(), name, trigger, schedule, prompt, enabled: true },
      ...a,
    ]);
    setName("");
    setPrompt("");
  }

  function toggle(id: string) {
    setItems((a) => a.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)));
  }

  return (
    <main className="min-h-screen bg-black text-white px-6 py-10 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold">Automations</h1>
      <div className="mt-6 space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Automation name"
          className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-4 py-2"
        />
        <select
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
          className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-4 py-2"
        >
          <option value="schedule">Scheduled</option>
          <option value="email">New email</option>
          <option value="slack">Slack message</option>
          <option value="calendar">Calendar event</option>
          <option value="notion">Notion update</option>
        </select>
        <input
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
          placeholder="Schedule (daily/weekly/cron)"
          className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-4 py-2"
        />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="What should happen?"
          className="w-full h-24 rounded-lg bg-neutral-900 border border-neutral-700 p-3"
        />
        <button onClick={create} className="bg-indigo-600 px-5 py-2 rounded-lg">
          Create automation
        </button>
      </div>
      <ul className="mt-8 space-y-3">
        {items.map((a) => (
          <li key={a.id} className="rounded-lg bg-neutral-900 border border-neutral-700 p-4 flex items-center justify-between">
            <div>
              <div className="font-semibold">{a.name}</div>
              <div className="text-sm text-neutral-400">
                {a.trigger} · {a.schedule}
              </div>
              <div className="text-sm mt-1">{a.prompt}</div>
            </div>
            <button
              onClick={() => toggle(a.id)}
              className={`px-3 py-1 rounded ${a.enabled ? "bg-green-600" : "bg-neutral-700"}`}
            >
              {a.enabled ? "On" : "Off"}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}