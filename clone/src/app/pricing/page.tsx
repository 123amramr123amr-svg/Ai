export default function Pricing() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-16 max-w-5xl mx-auto" dir="rtl">
      <h1 className="text-4xl font-bold">الأسعار</h1>
      <p className="text-neutral-400 mt-2">مجاني 100%. لا اشتراكات. كل شيء يعمل محلياً على جهازك.</p>
      <div className="mt-10 rounded-2xl bg-neutral-900 border border-neutral-800 p-6 max-w-md">
        <h2 className="text-xl font-semibold">مجاني للأبد</h2>
        <div className="text-3xl font-bold mt-2">$0</div>
        <ul className="text-neutral-300 text-sm mt-4 space-y-1">
          <li>• مهام غير محدودة</li>
          <li>• نماذج محلية (مفاتيحك)</li>
          <li>• دعم بدون اتصال (PWA)</li>
          <li>• لا اشتراكات، لا إعلانات</li>
        </ul>
        <button className="mt-6 w-full bg-indigo-600 py-2 rounded-lg">ابدأ</button>
      </div>
    </main>
  );
}