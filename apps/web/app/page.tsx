import Link from "next/link";
import { Brain, ArrowRight } from "lucide-react";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import { GessoIcon } from "../components/ui/GessoIcon";

export default function Home() {
  const features = [
    { label: "notes", icon: "inkblot", bg: "bg-rainbow-notes", text: "text-accent-notes" },
    { label: "readings", icon: "wave", bg: "bg-rainbow-reading", text: "text-accent-reading" },
    { label: "homework", icon: "bolt", bg: "bg-rainbow-homework", text: "text-accent-homework" },
    { label: "tests", icon: "flame", bg: "bg-rainbow-tests", text: "text-accent-tests" },
    { label: "rest", icon: "wave", bg: "bg-rainbow-chill", text: "text-accent-chill" },
  ];

  return (
    <main className="min-h-screen relative flex flex-col items-center justify-center bg-brand-gesso selection:bg-brand-green/10">
      {/* Subtle Texture Overlay */}
      <div className="fixed inset-0 gesso-texture z-0 pointer-events-none" />

      {/* Hero Section - Pure Minimalism */}
      <section className="w-full max-w-5xl mx-auto px-6 py-24 md:py-40 flex flex-col items-center text-center space-y-16 relative z-10">
        <div className="space-y-6">
          <h1 className="text-6xl md:text-8xl font-serif font-black text-brand-blue tracking-tight leading-[1.1]">
            Your brain's <span className="italic text-brand-green">base layer.</span>
          </h1>
          <p className="text-xl md:text-2xl text-slate-400 font-medium max-w-2xl mx-auto leading-relaxed">
            The neuro-adaptive canvas that transforms your messy syllabus into a spectrum of manageable wins.
          </p>
        </div>

        {/* Feature Spectrum - MyMind Style */}
        <div className="flex flex-wrap justify-center gap-3 animate-fade-in">
          {features.map((f) => (
            <div
              key={f.label}
              className={cn(
                "px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all hover:scale-105",
                f.bg, f.text
              )}
            >
              {f.label}
            </div>
          ))}
        </div>

        {/* Primary Action */}
        <div className="pt-8">
          <Link href="/dashboard">
            <Button className="rounded-full px-12 py-8 h-auto text-xl bg-brand-green hover:bg-brand-green/90 shadow-xl shadow-brand-green/10 group transition-all">
              Start your canvas
              <ArrowRight className="ml-3 h-6 w-6 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>
          <p className="mt-8 text-[10px] font-black text-slate-300 uppercase tracking-[0.4em] flex items-center justify-center gap-2">
            Built for the brilliant mind <Brain className="h-3 w-3" />
          </p>
        </div>
      </section>

      {/* Airy Feature Cards */}
      <section className="w-full max-w-7xl mx-auto px-6 pb-40 grid grid-cols-1 md:grid-cols-3 gap-8 relative z-10">
        <Link href="/dashboard" className="group">
          <div className="h-full p-10 rounded-[2.5rem] bg-white/40 backdrop-blur-sm border border-white/50 hover:bg-white hover:shadow-2xl hover:-translate-y-1 transition-all duration-500">
            <div className="w-16 h-16 rounded-3xl bg-rainbow-homework flex items-center justify-center text-accent-homework mb-8 group-hover:rotate-3 transition-transform">
              <GessoIcon type="portal" size={32} />
            </div>
            <h3 className="font-serif font-black text-3xl text-brand-blue mb-4">The Roadmap</h3>
            <p className="text-slate-400 font-medium leading-relaxed">
              A visual overview of your momentum, energy, and upcoming wins.
            </p>
          </div>
        </Link>

        <Link href="/calendar" className="group">
          <div className="h-full p-10 rounded-[2.5rem] bg-white/40 backdrop-blur-sm border border-white/50 hover:bg-white hover:shadow-2xl hover:-translate-y-1 transition-all duration-500">
            <div className="w-16 h-16 rounded-3xl bg-rainbow-tests flex items-center justify-center text-accent-tests mb-8 group-hover:rotate-3 transition-transform">
              <GessoIcon type="bolt" size={32} />
            </div>
            <h3 className="font-serif font-black text-3xl text-brand-blue mb-4">The Canvas</h3>
            <p className="text-slate-400 font-medium leading-relaxed">
              Neuro-adaptive scheduling that works with your brain, not against it.
            </p>
          </div>
        </Link>

        <Link href="/upload" className="group">
          <div className="h-full p-10 rounded-[2.5rem] bg-white/40 backdrop-blur-sm border border-white/50 hover:bg-white hover:shadow-2xl hover:-translate-y-1 transition-all duration-500">
            <div className="w-16 h-16 rounded-3xl bg-rainbow-reading flex items-center justify-center text-accent-reading mb-8 group-hover:rotate-3 transition-transform">
              <GessoIcon type="inkblot" size={32} />
            </div>
            <h3 className="font-serif font-black text-3xl text-brand-blue mb-4">Quick Ingest</h3>
            <p className="text-slate-400 font-medium leading-relaxed">
              Drop your syllabus and let the AI build your backwards plan in seconds.
            </p>
          </div>
        </Link>
      </section>
    </main>
  );
}
