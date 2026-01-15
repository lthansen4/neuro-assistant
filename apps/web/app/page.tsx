import Link from "next/link";
import { Layout, Calendar, Upload, Sparkles, Brain, ArrowRight } from "lucide-react";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";

export default function Home() {
  const features = [
    { label: "notes", color: "bg-rainbow-notes text-yellow-900 border-yellow-200" },
    { label: "readings", color: "bg-rainbow-reading text-orange-900 border-orange-200" },
    { label: "homework", color: "bg-rainbow-homework text-brand-green border-brand-green/20" },
    { label: "tests", color: "bg-rainbow-tests text-blue-900 border-blue-200" },
    { label: "rest", color: "bg-rainbow-chill text-purple-900 border-purple-200" },
  ];

  const paintLines = [
    { color: "bg-[#D4AF37]", delay: "0s", left: "5%" },
    { color: "bg-[#E5945C]", delay: "1s", left: "15%" },
    { color: "bg-[#006747]", delay: "0.5s", left: "25%" },
    { color: "bg-[#5C7EA5]", delay: "2s", left: "75%" },
    { color: "bg-[#8B5CF6]", delay: "1.5s", left: "85%" },
    { color: "bg-[#D4AF37]", delay: "3s", left: "95%" },
  ];

  return (
    <main className="min-h-screen relative flex flex-col items-center justify-center overflow-x-hidden bg-[#FDFDFD]">
      {/* Gesso Texture Overlay */}
      <div className="fixed inset-0 gesso-texture z-0" />

      {/* Dripping Paint Lines Animation */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {paintLines.map((line, i) => (
          <div
            key={i}
            className={cn(
              "absolute top-0 paint-line animate-paint-drip opacity-10 md:opacity-20",
              line.color
            )}
            style={{ 
              left: line.left, 
              animationDelay: line.delay,
              height: '120vh'
            }}
          />
        ))}
      </div>

      {/* Editorial Hero Section */}
      <section className="w-full max-w-7xl mx-auto px-6 py-24 md:py-32 flex flex-col items-center text-center space-y-12 relative z-10">
        <div className="space-y-8 max-w-5xl">
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-white border border-slate-100 shadow-xl text-brand-green text-[10px] font-black uppercase tracking-[0.3em] animate-fade-in">
            <Sparkles className="h-3 w-3 fill-current" />
            <span>The digital gesso for your mind</span>
          </div>
          
          <h1 className="text-7xl md:text-[10rem] font-serif font-black text-brand-blue tracking-tighter leading-[0.85] md:leading-[0.8]">
            Your time is <br className="hidden md:block" />
            a <span className="text-brand-green italic">canvas.</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-slate-400 font-medium max-w-2xl mx-auto leading-relaxed px-4">
            Gesso prepares your mental space with adaptive structure, 
            so you can focus on the masterpiece of your education.
          </p>
        </div>

        {/* Soft Rainbow Pills (MyMind Style) */}
        <div className="flex flex-wrap justify-center gap-4 max-w-3xl animate-slide-up">
          <span className="text-slate-300 font-bold uppercase tracking-widest text-[10px] self-center mr-2">Capture</span>
          {features.map((f) => (
            <div
              key={f.label}
              className={cn(
                "px-8 py-3 rounded-full text-xs font-black uppercase tracking-[0.2em] shadow-sm border transition-all hover:scale-105 hover:shadow-xl",
                f.color
              )}
            >
              {f.label}
            </div>
          ))}
          <span className="text-slate-300 font-bold uppercase tracking-widest text-[10px] self-center ml-2">Guilt-Free</span>
        </div>

        {/* Primary Action */}
        <div className="pt-16 animate-fade-in-delayed">
          <Link href="/dashboard">
            <Button className="rounded-full px-16 py-10 h-auto text-2xl bg-brand-green hover:bg-brand-green/90 shadow-[0_20px_50px_rgba(0,103,71,0.2)] group border-none">
              Enter workspace
              <ArrowRight className="ml-4 h-8 w-8 transition-transform group-hover:translate-x-2" />
            </Button>
          </Link>
          
          <div className="mt-12 flex flex-col items-center gap-6">
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em] flex items-center gap-3">
              Built for the brilliant AuDHD mind <Brain className="h-4 w-4 text-brand-green" />
            </p>
          </div>
        </div>
      </section>

      {/* Floating Decorative Cards */}
      <section className="w-full max-w-7xl mx-auto px-6 pb-32 grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 relative z-10">
        <Link href="/dashboard" className="group block">
          <div className="h-full p-12 rounded-[4rem] bg-white border border-slate-50 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.05)] hover:shadow-2xl hover:-translate-y-2 transition-all duration-700 flex flex-col gap-8">
            <div className="w-20 h-20 rounded-3xl bg-rainbow-homework/30 flex items-center justify-center text-brand-green group-hover:rotate-6 transition-transform">
              <Layout size={40} strokeWidth={2} />
            </div>
            <div className="space-y-3">
              <h3 className="font-serif font-black text-4xl text-brand-blue leading-none">The Roadmap</h3>
              <p className="text-slate-400 text-lg font-medium leading-relaxed">
                A visual overview of your momentum, energy, and upcoming wins.
              </p>
            </div>
          </div>
        </Link>

        <Link href="/calendar" className="group block">
          <div className="h-full p-12 rounded-[4rem] bg-white border border-slate-50 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.05)] hover:shadow-2xl hover:-translate-y-2 transition-all duration-700 flex flex-col gap-8">
            <div className="w-20 h-20 rounded-3xl bg-rainbow-tests/30 flex items-center justify-center text-blue-600 group-hover:rotate-6 transition-transform">
              <Calendar size={40} strokeWidth={2} />
            </div>
            <div className="space-y-3">
              <h3 className="font-serif font-black text-4xl text-brand-blue leading-none">The Canvas</h3>
              <p className="text-slate-400 text-lg font-medium leading-relaxed">
                Neuro-adaptive scheduling that works with your brain, not against it.
              </p>
            </div>
          </div>
        </Link>

        <Link href="/upload" className="group block">
          <div className="h-full p-12 rounded-[4rem] bg-white border border-slate-50 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.05)] hover:shadow-2xl hover:-translate-y-2 transition-all duration-700 flex flex-col gap-8">
            <div className="w-20 h-20 rounded-3xl bg-rainbow-reading/30 flex items-center justify-center text-orange-600 group-hover:rotate-6 transition-transform">
              <Upload size={40} strokeWidth={2} />
            </div>
            <div className="space-y-3">
              <h3 className="font-serif font-black text-4xl text-brand-blue leading-none">Quick Ingest</h3>
              <p className="text-slate-400 text-lg font-medium leading-relaxed">
                Drop your syllabus and let the AI build your plan in seconds.
              </p>
            </div>
          </div>
        </Link>
      </section>
    </main>
  );
}
