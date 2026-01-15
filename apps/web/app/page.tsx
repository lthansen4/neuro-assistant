import Link from "next/link";
import { Brain, ArrowRight } from "lucide-react";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import { GessoIcon } from "../components/ui/GessoIcon";

export default function Home() {
  const features = [
    { label: "notes", icon: "inkblot", color: "text-rainbow-gold bg-white border-rainbow-gold/20 shadow-aura-gold" },
    { label: "readings", icon: "wave", color: "text-rainbow-terracotta bg-white border-rainbow-terracotta/20 shadow-aura-terracotta" },
    { label: "homework", icon: "bolt", color: "text-rainbow-moss bg-white border-rainbow-moss/20 shadow-aura-moss" },
    { label: "tests", icon: "flame", color: "text-rainbow-slate bg-white border-rainbow-slate/20 shadow-aura-slate" },
    { label: "rest", icon: "wave", color: "text-rainbow-violet bg-white border-rainbow-violet/20 shadow-aura-violet" },
  ];

  const paintLines = [
    { color: "bg-rainbow-gold", delay: "0s", left: "5%" },
    { color: "bg-rainbow-terracotta", delay: "1s", left: "15%" },
    { color: "bg-rainbow-moss", delay: "0.5s", left: "25%" },
    { color: "bg-rainbow-slate", delay: "2s", left: "75%" },
    { color: "bg-rainbow-violet", delay: "1.5s", left: "85%" },
    { color: "bg-rainbow-gold", delay: "3s", left: "95%" },
  ];

  return (
    <main className="min-h-screen relative flex flex-col items-center justify-center overflow-x-hidden bg-brand-gesso">
      {/* Gesso Texture Overlay */}
      <div className="fixed inset-0 gesso-texture z-0 pointer-events-none" />

      {/* Dripping Paint Lines Animation */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {paintLines.map((line, i) => (
          <div
            key={i}
            className={cn(
              "absolute top-0 paint-line animate-paint-drip",
              line.color
            )}
            style={{ 
              left: line.left, 
              animationDelay: line.delay,
              height: '140vh'
            }}
          />
        ))}
      </div>

      {/* Editorial Hero Section */}
      <section className="w-full max-w-7xl mx-auto px-6 py-24 md:py-32 flex flex-col items-center text-center space-y-12 relative z-10">
        <div className="space-y-8 max-w-5xl">
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white/80 backdrop-blur-md border border-slate-200 shadow-xl text-brand-green text-[10px] font-black uppercase tracking-[0.3em] animate-fade-in">
            <GessoIcon type="prism" className="h-4 w-4" />
            <span>Scanning for chaos...</span>
          </div>
          
          <h1 className="text-7xl md:text-[11rem] font-serif font-black text-brand-blue tracking-tighter leading-[0.8] md:leading-[0.75]">
            Your brain's <br className="hidden md:block" />
            <span className="text-brand-green italic">base layer.</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-slate-500 font-medium max-w-2xl mx-auto leading-relaxed px-4">
            This is where your syllabus magic happens. We do the boring part, so you can focus on the masterpiece.
          </p>
        </div>

        {/* Gesso Icons (Earthy Rainbow Style) */}
        <div className="flex flex-wrap justify-center gap-6 max-w-4xl animate-slide-up pt-8">
          {features.map((f) => (
            <div
              key={f.label}
              className={cn(
                "group flex items-center gap-3 px-8 py-4 rounded-[2rem] text-sm font-black uppercase tracking-[0.2em] transition-all hover:scale-110",
                f.color
              )}
            >
              <GessoIcon type={f.icon as any} size={24} className="transition-transform group-hover:rotate-12" />
              <span className="hidden sm:inline">{f.label}</span>
            </div>
          ))}
        </div>

        {/* Primary Action */}
        <div className="pt-20 animate-fade-in-delayed">
          <Link href="/dashboard">
            <Button className="rounded-full px-20 py-12 h-auto text-2xl bg-brand-green hover:bg-brand-green/90 shadow-aura-moss group border-none text-white">
              Enter Workspace
              <ArrowRight className="ml-4 h-8 w-8 transition-transform group-hover:translate-x-3" />
            </Button>
          </Link>
          
          <div className="mt-16 flex flex-col items-center gap-6 opacity-40">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.5em] flex items-center gap-4">
              Built for the brilliant mind <Brain className="h-4 w-4" />
            </p>
          </div>
        </div>
      </section>

      {/* Mockup-style Cards Section */}
      <section className="w-full max-w-7xl mx-auto px-6 pb-40 grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-16 relative z-10">
        <Link href="/dashboard" className="group">
          <div className="h-full p-12 rounded-[3.5rem] bg-white border border-slate-200/50 shadow-sm hover:shadow-aura-terracotta hover:-translate-y-4 transition-all duration-700 flex flex-col gap-10">
            <div className="w-24 h-24 rounded-4xl bg-rainbow-terracotta/10 flex items-center justify-center text-rainbow-terracotta group-hover:rotate-6 transition-transform">
              <GessoIcon type="portal" size={48} />
            </div>
            <div className="space-y-4">
              <h3 className="font-serif font-black text-4xl text-brand-blue tracking-tight">The Spectrum</h3>
              <p className="text-slate-500 text-lg font-medium leading-relaxed">
                Break your messy syllabus into a spectrum of manageable wins.
              </p>
            </div>
          </div>
        </Link>

        <Link href="/calendar" className="group">
          <div className="h-full p-12 rounded-[3.5rem] bg-white border border-slate-200/50 shadow-sm hover:shadow-aura-moss hover:-translate-y-4 transition-all duration-700 flex flex-col gap-10">
            <div className="w-24 h-24 rounded-4xl bg-rainbow-moss/10 flex items-center justify-center text-rainbow-moss group-hover:rotate-6 transition-transform">
              <GessoIcon type="bolt" size={48} />
            </div>
            <div className="space-y-4">
              <h3 className="font-serif font-black text-4xl text-brand-blue tracking-tight">Energy Flow</h3>
              <p className="text-slate-500 text-lg font-medium leading-relaxed">
                Schedule based on how you actually feel, not what the clock says.
              </p>
            </div>
          </div>
        </Link>

        <Link href="/upload" className="group">
          <div className="h-full p-12 rounded-[3.5rem] bg-white border border-slate-200/50 shadow-sm hover:shadow-aura-violet hover:-translate-y-4 transition-all duration-700 flex flex-col gap-10">
            <div className="w-24 h-24 rounded-4xl bg-rainbow-violet/10 flex items-center justify-center text-rainbow-violet group-hover:rotate-6 transition-transform">
              <GessoIcon type="brick" size={48} />
            </div>
            <div className="space-y-4">
              <h3 className="font-serif font-black text-4xl text-brand-blue tracking-tight">The Pivot</h3>
              <p className="text-slate-500 text-lg font-medium leading-relaxed">
                When the wall is too tall, we help you micro-chunk your way through.
              </p>
            </div>
          </div>
        </Link>
      </section>
    </main>
  );
}
