import Link from "next/link";

const chips = ["إنشاء شرائح", "بناء موقع", "إنشاء ألعاب", "فيديو", "تصميم", "المزيد"];

const features = [
  { title: "تطبيق ويب", desc: "بناء مواقع كاملة بالذكاء الاصطناعي", href: "/features/webapp" },
  { title: "تطبيق جوال", desc: "بناء تطبيقات iOS و Android", href: "/features/mobile" },
  { title: "تطوير ألعاب", desc: "أنشئ لعبتك الخاصة", href: "/features/games" },
  { title: "Figma إلى كود", desc: "تحويل التصاميم إلى تطبيقات", href: "/features/figma" },
  { title: "فيديو", desc: "حول فكرة إلى فيلم", href: "/features/video" },
  { title: "شرائح AI", desc: "إنشاء شرائح بالذكاء الاصطناعي", href: "/features/slides" },
  { title: "تصميم AI", desc: "أتمتة رحلة التصميم", href: "/features/design" },
  { title: "بحث واسع", desc: "بحث متوازي على نطاق واسع", href: "/features/research" },
  { title: "أتمتة", desc: "دع العمل المتكرر يعمل بالذكاء الاصطناعي", href: "/features/automations" },
  { title: "مشاريع", desc: "احتفظ بمعرفة المشروع معاً", href: "/features/projects" },
  { title: "موصلات", desc: "ربط 60+ تطبيق", href: "/features/connectors" },
  { title: "حاسوب سحابي", desc: "دع الوكلاء يعملون 24/7", href: "/features/cloud" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white" dir="rtl">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
        <Link href="/" className="font-bold text-lg">استنساخ Manus</Link>
        <div className="flex gap-6 text-sm text-neutral-300">
          <Link href="/features">الميزات</Link>
          <Link href="/pricing">الأسعار</Link>
          <Link href="/login" className="bg-indigo-600 px-4 py-2 rounded-lg text-white">تسجيل الدخول</Link>
        </div>
      </nav>

      <section className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight">ماذا يمكنني أن أفعل لك؟</h1>
        <p className="mt-4 text-neutral-400">أقل هيكل، ذكاء أكثر.</p>
        <div className="mt-8 w-full max-w-2xl">
          <input
            type="text"
            placeholder="صف مهمة..."
            className="w-full rounded-2xl bg-neutral-900 border border-neutral-700 px-6 py-4 text-lg focus:outline-none focus:border-indigo-500"
          />
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            {chips.map((c) => (
              <button key={c} className="px-4 py-2 rounded-full bg-neutral-800 hover:bg-neutral-700 text-sm">
                {c}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold mb-8">استكشف الميزات</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {features.map((f) => (
            <Link key={f.title} href={f.href} className="rounded-2xl bg-neutral-900 border border-neutral-800 p-6 hover:border-indigo-500 transition">
              <h3 className="font-semibold text-lg">{f.title}</h3>
              <p className="text-neutral-400 text-sm mt-2">{f.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <footer className="border-t border-neutral-800 px-6 py-8 text-center text-neutral-500 text-sm">
        © 2026 استنساخ Manus — مجاني 100%
      </footer>
    </main>
  );
}