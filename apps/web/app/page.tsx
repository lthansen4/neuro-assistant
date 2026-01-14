import Link from "next/link";
import { Layout, Calendar, Upload, Sparkles, Brain } from "lucide-react";
import { Button } from "../components/ui/button";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#F8FAFF] relative overflow-hidden flex flex-col items-center justify-center p-6">
      {/* Background Decorative Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-200/30 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-200/30 rounded-full blur-[120px]" />

      <div className="max-w-4xl w-full space-y-12 relative z-10 text-center">
        {/* Hero Section */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" />
            <span>AI-Powered Executive Functioning</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-slate-900">
            Neuro-Assistant <span className="text-indigo-600">Pro</span>
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            The intelligent planner for AuDHD students. Less overwhelm, more momentum.
          </p>
        </div>

        {/* Quick Access Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto">
          <Link href="/dashboard" className="group">
            <div className="h-full p-6 rounded-2xl bg-white/60 backdrop-blur-md border border-white shadow-sm hover:shadow-md hover:border-indigo-200 transition-all flex flex-col items-center gap-4 text-center">
              <div className="p-4 rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <Layout className="h-8 w-8" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-900">Dashboard</h3>
                <p className="text-sm text-slate-500 mt-1">See your momentum and tasks</p>
              </div>
            </div>
          </Link>

          <Link href="/calendar" className="group">
            <div className="h-full p-6 rounded-2xl bg-white/60 backdrop-blur-md border border-white shadow-sm hover:shadow-md hover:border-indigo-200 transition-all flex flex-col items-center gap-4 text-center">
              <div className="p-4 rounded-xl bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <Calendar className="h-8 w-8" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-900">Calendar</h3>
                <p className="text-sm text-slate-500 mt-1">Neuro-adaptive scheduling</p>
              </div>
            </div>
          </Link>

          <Link href="/upload" className="group">
            <div className="h-full p-6 rounded-2xl bg-white/60 backdrop-blur-md border border-white shadow-sm hover:shadow-md hover:border-indigo-200 transition-all flex flex-col items-center gap-4 text-center">
              <div className="p-4 rounded-xl bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                <Upload className="h-8 w-8" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-900">Upload Syllabus</h3>
                <p className="text-sm text-slate-500 mt-1">AI-powered backwards planning</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Footer/Bottom Action */}
        <div className="pt-8">
          <Link href="/dashboard">
            <Button className="rounded-full px-8 py-6 h-auto text-lg bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 group">
              Get Started
              <Sparkles className="ml-2 h-5 w-5 animate-pulse" />
            </Button>
          </Link>
          <p className="mt-4 text-sm text-slate-400 font-medium flex items-center justify-center gap-2">
            Built for the brilliant AuDHD mind <Brain className="h-4 w-4" />
          </p>
        </div>
      </div>
    </main>
  );
}
