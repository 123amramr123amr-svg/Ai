export default function Pricing() {
  const plans = [
    { name: "Free", price: "$0", desc: "Try the agent" },
    { name: "Pro", price: "$39/mo", desc: "More credits, priority" },
    { name: "Team", price: "Custom", desc: "SSO, shared workspace" },
  ];
  return (
    <main className="min-h-screen bg-black text-white px-6 py-16 max-w-5xl mx-auto">
      <h1 className="text-4xl font-bold">Pricing</h1>
      <div className="mt-10 grid md:grid-cols-3 gap-6">
        {plans.map((p) => (
          <div key={p.name} className="rounded-2xl bg-neutral-900 border border-neutral-800 p-6">
            <h2 className="text-xl font-semibold">{p.name}</h2>
            <div className="text-3xl font-bold mt-2">{p.price}</div>
            <p className="text-neutral-400 text-sm mt-2">{p.desc}</p>
            <button className="mt-6 w-full bg-indigo-600 py-2 rounded-lg">Get started</button>
          </div>
        ))}
      </div>
    </main>
  );
}