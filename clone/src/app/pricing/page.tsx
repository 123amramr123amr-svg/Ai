export default function Pricing() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-16 max-w-5xl mx-auto">
      <h1 className="text-4xl font-bold">Pricing</h1>
      <p className="text-neutral-400 mt-2">100% free. No subscriptions. Everything runs locally on your device.</p>
      <div className="mt-10 rounded-2xl bg-neutral-900 border border-neutral-800 p-6 max-w-md">
        <h2 className="text-xl font-semibold">Free Forever</h2>
        <div className="text-3xl font-bold mt-2">$0</div>
        <ul className="text-neutral-300 text-sm mt-4 space-y-1">
          <li>• Unlimited tasks</li>
          <li>• Local models (your own keys)</li>
          <li>• Offline support (PWA)</li>
          <li>• No subscriptions, no ads</li>
        </ul>
        <button className="mt-6 w-full bg-indigo-600 py-2 rounded-lg">Get started</button>
      </div>
    </main>
  );
}