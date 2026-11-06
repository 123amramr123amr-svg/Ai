"use client";
import { useState, useEffect } from "react";

export default function AppPage() {
  const [prompt, setPrompt] = useState("");
  const [tasks, setTasks] = useState<string[]>([]);

  useEffect(() => {
    const t = localStorage.getItem("tasks");
    if (t) setTasks(JSON.parse(t));
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    const next = [prompt, ...tasks];
    setTasks(next);
    localStorage.setItem("tasks", JSON.stringify(next));
    setPrompt("");
  }

  return (
    <main className="min-h-screen bg-black text-white flex" dir="rtl">
      <aside className="w-64 border-l border-neutral-800 p-4 hidden md:block">
        <div className="font-bold mb-4">استنساخ Manus</div>
        <nav className="space-y-2 text-sm text-neutral-300">
          <div>المهام</div>
          <div>المشاريع</div>
          <div>الموصلات</div>
          <div>الأتمتة</div>
          <div>النماذج</div>
        </nav>
      </aside>
      <section className="flex-1 p-6">
        <form onSubmit={submit} className="max-w-3xl mx-auto">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="ماذا يمكنني أن أفعل لك؟"
            className="w-full h-32 rounded-2xl bg-neutral-900 border border-neutral-700 p-4 focus:outline-none focus:border-indigo-500"
          />
          <button className="mt-3 bg-indigo-600 px-6 py-2 rounded-lg">تشغيل</button>
        </form>
        <div className="max-w-3xl mx-auto mt-8 space-y-3">
          {tasks.map((t, i) => (
            <div key={i} className="rounded-xl bg-neutral-900 border border-neutral-800 p-4">
              <div className="text-sm text-neutral-400">مهمة</div>
              <div>{t}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}