import Link from "next/link";
import { Layout, Calendar, Upload, Sparkles, Brain, ArrowRight } from "lucide-react";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";

export default function Home() {
  const features = [
    { label: "notes", color: "bg-rainbow-notes text-yellow-800" },
    { label: "readings", color: "bg-rainbow-reading text-orange-800" },
    { label: "homework", color: "bg-rainbow-homework text-brand-green" },
    { label: "tests", color: "bg-rainbow-tests text-blue-800" },
    { label: "rest", color: "bg-rainbow-chill text-purple-800" },
  ];

  return (
    <main className="min-h-screen relative flex flex-col items-center justify-center overflow-x-hidden">
      {/* Editorial Hero Section */}
      <section className="w-full max-w-7xl mx-auto px-6 py-24 md:py-32 flex flex-col items-center text-center space-y-12">
        <div className="space-y-6 max-w-4xl">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/50 backdrop-blur-sm border border-slate-100 shadow-sm text-brand-green text-[10px] font-black uppercase tracking-[0.2em] animate-fade-in">
            <Sparkles className="h-3 w-3 fill-current" />
            <span>The digital primer for your mind</span>
          </div>
          
          <h1 className="text-7xl md:text-9xl font-serif font-black text-brand-blue tracking-tight leading-[0.9] md:leading-[0.85]">
            Remember everything. <br className="hidden md:block" />
            Organize <span className="text-brand-green">nothing.</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-slate-400 font-medium max-w-2xl mx-auto leading-relaxed">
            Gesso is the neuro-adaptive workspace that prepares your mental canvas, 
            so you can focus on the masterpiece of your education.
          </p>
        </div>

        {/* Soft Rainbow Pills (MyMind Style) */}
        <div className="flex flex-wrap justify-center gap-3 max-w-2xl animate-slide-up">
          <span className="text-slate-400 font-medium mr-2 self-center">All your</span>
          {features.map((f) => (
            <div
              key={f.label}
              className={cn(
                "px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest shadow-sm border border-white/50 transition-transform hover:scale-105 hover:shadow-md",
                f.color
              )}
            >
              {f.label}
            </div>
          ))}
          <span className="text-slate-400 font-medium ml-2 self-center text-center w-full md:w-auto mt-2 md:mt-0">
            in one single, private place.
          </span>
        </div>

        {/* Primary Action */}
        <div className="pt-12 animate-fade-in-delayed">
          <Link href="/dashboard">
            <Button className="rounded-full px-12 py-8 h-auto text-xl bg-brand-green hover:bg-brand-green/90 shadow-2xl shadow-brand-green/20 group">
              Start your canvas
              <ArrowRight className="ml-3 h-6 w-6 transition-transform group-hover:translate-x-1" />
            </Button>
          </Link>
          <div className="mt-8 flex flex-col items-center gap-4">
            <div className="flex -space-x-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-400">
                  {String.fromCharCode(64 + i)}
                </div>
              ))}
            </div>
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] flex items-center gap-2">
              Built for the brilliant AuDHD mind <Brain className="h-3 w-3" />
            </p>
          </div>
        </div>
      </section>

      {/* Adaptive Feature Grid */}
      <section className="w-full max-w-7xl mx-auto px-6 pb-24 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
        <Link href="/dashboard" className="group block">
          <div className="h-full p-10 rounded-[3rem] bg-white/40 backdrop-blur-sm border border-white/60 shadow-sm hover:shadow-2xl hover:bg-white hover:border-brand-green/10 transition-all duration-500 flex flex-col gap-6">
            <div className="w-16 h-16 rounded-[1.5rem] bg-rainbow-homework/50 flex items-center justify-center text-brand-green group-hover:scale-110 transition-transform">
              <Layout size={32} strokeWidth={2.5} />
            </div>
            <div className="space-y-2">
              <h3 className="font-serif font-black text-3xl text-brand-blue leading-none">The Roadmap</h3>
              <p className="text-slate-400 font-medium leading-relaxed">
                A visual overview of your momentum, energy, and upcoming wins.
              </p>
            </div>
          </div>
        </Link>

        <Link href="/calendar" className="group block">
          <div className="h-full p-10 rounded-[3rem] bg-white/40 backdrop-blur-sm border border-white/60 shadow-sm hover:shadow-2xl hover:bg-white hover:border-brand-green/10 transition-all duration-500 flex flex-col gap-6">
            <div className="w-16 h-16 rounded-[1.5rem] bg-rainbow-tests/50 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
              <Calendar size={32} strokeWidth={2.5} />
            </div>
            <div className="space-y-2">
              <h3 className="font-serif font-black text-3xl text-brand-blue leading-none">The Canvas</h3>
              <p className="text-slate-400 font-medium leading-relaxed">
                Neuro-adaptive scheduling that works with your brain, not against it.
              </p>
            </div>
          </div>
        </Link>

        <Link href="/upload" className="group block">
          <div className="h-full p-10 rounded-[3rem] bg-white/40 backdrop-blur-sm border border-white/60 shadow-sm hover:shadow-2xl hover:bg-white hover:border-brand-green/10 transition-all duration-500 flex flex-col gap-6">
            <div className="w-16 h-16 rounded-[1.5rem] bg-rainbow-reading/50 flex items-center justify-center text-orange-600 group-hover:scale-110 transition-transform">
              <Upload size={32} strokeWidth={2.5} />
            </div>
            <div className="space-y-2">
              <h3 className="font-serif font-black text-3xl text-brand-blue leading-none">Quick Ingest</h3>
              <p className="text-slate-400 font-medium leading-relaxed">
                Drop your syllabus and let the AI build your backwards plan in seconds.
              </p>
            </div>
          </div>
        </Link>
      </section>

      {/* Floating Decorative Blobs (Holi Style) */}
      <div className="absolute top-[15%] right-[-5%] w-64 h-64 bg-rainbow-chill/20 rounded-full blur-3xl -z-10 animate-pulse" />
      <div className="absolute bottom-[10%] left-[-5%] w-96 h-96 bg-rainbow-homework/20 rounded-full blur-3xl -z-10 animate-pulse" />
    </main>
  );
}
