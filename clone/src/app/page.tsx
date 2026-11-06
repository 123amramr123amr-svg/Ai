import Link from "next/link";

const chips = ["Create slides", "Build website", "Create games", "Video", "Design", "More"];

const features = [
  { title: "Web app", desc: "Build full-stack, AI-powered sites", href: "/features/webapp" },
  { title: "Mobile app", desc: "Build native iOS & Android apps", href: "/features/mobile" },
  { title: "Game development", desc: "Make your own game", href: "/features/games" },
  { title: "Figma to code", desc: "Turn designs into working web apps", href: "/features/figma" },
  { title: "Video", desc: "Turn an idea into a film", href: "/features/video" },
  { title: "AI slides", desc: "Create slides with AI", href: "/features/slides" },
  { title: "AI design", desc: "Automates the entire design journey", href: "/features/design" },
  { title: "Wide Research", desc: "Parallel research at scale", href: "/features/research" },
  { title: "Automations", desc: "Let recurring work run with AI", href: "/features/automations" },
  { title: "Projects", desc: "Keep project knowledge together", href: "/features/projects" },
  { title: "Connectors", desc: "Connect 60+ apps", href: "/features/connectors" },
  { title: "Cloud Computer", desc: "Keep agents running 24/7", href: "/features/cloud" },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
        <Link href="/" className="font-bold text-lg">Manus Clone</Link>
        <div className="flex gap-6 text-sm text-neutral-300">
          <Link href="/features">Features</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/app" className="bg-indigo-600 px-4 py-2 rounded-lg text-white">Get started</Link>
        </div>
      </nav>

      <section className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight">What can I do for you?</h1>
        <p className="mt-4 text-neutral-400">Less structure, more intelligence.</p>
        <div className="mt-8 w-full max-w-2xl">
          <input
            type="text"
            placeholder="Describe a task..."
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
        <h2 className="text-3xl font-bold mb-8">Explore features</h2>
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
        © 2026 Manus Clone
      </footer>
    </main>
  );
}