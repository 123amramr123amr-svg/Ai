"use client";
import { useState } from "react";

type Skill = { id: string; name: string; url: string };

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [url, setUrl] = useState("");

  function install() {
    if (!url.trim()) return;
    setSkills((s) => [{ id: crypto.randomUUID(), name: url.split("/").pop() || "skill", url }, ...s]);
    setUrl("");
  }

  return (
    <main className="min-h-screen bg-black text-white px-6 py-10 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold">Agent Skills</h1>
      <p className="text-neutral-400 text-sm mt-2">
        Install skills from a URL (progressive disclosure: metadata cheap, full instructions on trigger).
      </p>
      <div className="mt-6 flex gap-3">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/.../skill"
          className="flex-1 rounded-lg bg-neutral-900 border border-neutral-700 px-4 py-2"
        />
        <button onClick={install} className="bg-indigo-600 px-5 py-2 rounded-lg">
          Install
        </button>
      </div>
      <ul className="mt-8 space-y-2">
        {skills.map((s) => (
          <li key={s.id} className="rounded-lg bg-neutral-900 border border-neutral-700 px-4 py-3">
            <div className="font-semibold">{s.name}</div>
            <div className="text-sm text-neutral-400">{s.url}</div>
          </li>
        ))}
      </ul>
    </main>
  );
}