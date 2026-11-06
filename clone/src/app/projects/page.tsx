"use client";
import { useState } from "react";

type Project = { id: string; name: string; instruction: string; files: string[] };

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [instruction, setInstruction] = useState("");

  function create() {
    if (!name.trim()) return;
    setProjects((p) => [
      { id: crypto.randomUUID(), name, instruction, files: [] },
      ...p,
    ]);
    setName("");
    setInstruction("");
  }

  function addFile(id: string, file: string) {
    setProjects((p) =>
      p.map((pr) => (pr.id === id ? { ...pr, files: [...pr.files, file] } : pr))
    );
  }

  return (
    <main className="min-h-screen bg-black text-white px-6 py-10 max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold">Projects</h1>
      <div className="mt-6 space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name"
          className="w-full rounded-lg bg-neutral-900 border border-neutral-700 px-4 py-2"
        />
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Master instruction (applied to every session)"
          className="w-full h-24 rounded-lg bg-neutral-900 border border-neutral-700 p-3"
        />
        <button onClick={create} className="bg-indigo-600 px-5 py-2 rounded-lg">
          Create project
        </button>
      </div>
      <ul className="mt-8 space-y-4">
        {projects.map((p) => (
          <li key={p.id} className="rounded-lg bg-neutral-900 border border-neutral-700 p-4">
            <div className="font-semibold">{p.name}</div>
            <div className="text-sm text-neutral-400 mt-1 whitespace-pre-wrap">{p.instruction}</div>
            <div className="mt-2">
              <input
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) addFile(p.id, f.name);
                }}
                className="text-sm"
              />
            </div>
            {p.files.length > 0 && (
              <ul className="mt-2 text-sm text-neutral-300">
                {p.files.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}