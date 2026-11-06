import Link from "next/link";

export default function Features() {
  return (
    <main className="min-h-screen bg-black text-white px-6 py-16 max-w-5xl mx-auto">
      <Link href="/" className="text-neutral-400 hover:text-white">← Home</Link>
      <h1 className="text-4xl font-bold mt-6">Features</h1>
      <p className="text-neutral-400 mt-2">Build, create, research and automate.</p>
      <div className="mt-10 grid gap-6">
        {["Build apps and games", "Create videos, slides and designs", "Research and browse the web", "Automate and organize your work", "Connect your apps"].map((g) => (
          <section key={g} className="rounded-2xl bg-neutral-900 border border-neutral-800 p-6">
            <h2 className="text-xl font-semibold">{g}</h2>
            <p className="text-neutral-400 text-sm mt-2">Group of capabilities under {g.toLowerCase()}.</p>
          </section>
        ))}
      </div>
    </main>
  );
}