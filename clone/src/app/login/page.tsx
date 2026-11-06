"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const router = useRouter();

  function login(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !pass) {
      setErr("أدخل البريد وكلمة المرور");
      return;
    }
    localStorage.setItem("user", JSON.stringify({ email }));
    router.push("/app");
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center" dir="rtl">
      <form onSubmit={login} className="w-full max-w-sm space-y-4 bg-neutral-900 border border-neutral-800 rounded-2xl p-8">
        <h1 className="text-2xl font-bold text-center">تسجيل الدخول</h1>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="البريد الإلكتروني"
          className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-4 py-2"
        />
        <input
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          type="password"
          placeholder="كلمة المرور"
          className="w-full rounded-lg bg-neutral-950 border border-neutral-700 px-4 py-2"
        />
        {err && <div className="text-red-400 text-sm">{err}</div>}
        <button className="w-full bg-indigo-600 py-2 rounded-lg">دخول</button>
        <p className="text-neutral-500 text-xs text-center">
          محلي 100% — لا توجد اشتراكات
        </p>
      </form>
    </main>
  );
}