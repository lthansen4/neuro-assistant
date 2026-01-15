"use client";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { fetchDashboardSummary, fetchDashboardPreferences, updateDashboardPreferences } from "../../../lib/api";
import { ChillBank } from "../../../components/ChillBank";
import { GradeForecast } from "../../../components/GradeForecast";
import { StreakBadge } from "../../../components/StreakBadge";
import { ProductivitySummary } from "../../../components/ProductivitySummary";
import { AssignmentsList } from "../../../components/AssignmentsList";

interface Assignment {
  id: string;
  title: string;
  dueDate: string | null;
  category: string | null;
  status: "Inbox" | "Scheduled" | "Locked_In" | "Completed";
  effortEstimateMinutes: number | null;
  courseId: string | null;
  courseName: string | null;
  createdAt: string;
  submittedAt?: string | null;
}

interface DashboardData {
  preferences: any;
  range: "day" | "week";
  daily: any[];
  weekly: any;
  streak: any;
  forecasts: any[];
  assignments?: {
    inbox: Assignment[];
    scheduled: Assignment[];
    completed: Assignment[];
  };
}

export default function DashboardPage() {
  const { user, isLoaded } = useUser();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<"day" | "week">("week");
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadDashboard = async (showLoader = true) => {
    if (!user) return;
    try {
      if (showLoader) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);
      const userId = user.id;
      const summary = await fetchDashboardSummary(userId, range);
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard/page.tsx:61',message:'Dashboard data fetched',data:{assignmentTitles:summary?.assignments?.scheduled?.map((a: any)=>a.title),completedTitles:summary?.assignments?.completed?.map((a: any)=>a.title)},timestamp:Date.now(),sessionId:'debug-session',runId:'title-sync',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      
      setData(summary);
      setLastRefresh(new Date());
      console.log('[Dashboard] Data refreshed at', new Date().toLocaleTimeString());
    } catch (err: any) {
      const errorMessage = err.message || "Failed to load dashboard";
      setError(errorMessage);
      console.error("Dashboard error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial load
  useEffect(() => {
    if (!isLoaded || !user) {
      setLoading(false);
      return;
    }
    loadDashboard(true);
  }, [user, isLoaded, range]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    if (!user) return;
    
    const interval = setInterval(() => {
      console.log('[Dashboard] Auto-refreshing...');
      loadDashboard(false);
    }, 10000); // 10 seconds

    return () => clearInterval(interval);
  }, [user, range]);

  // Refresh when window gains focus (user returns to tab)
  useEffect(() => {
    const handleFocus = () => {
      console.log('[Dashboard] Window focused, refreshing...');
      loadDashboard(false);
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [user, range]);

  const handleRangeChange = async (newRange: "day" | "week") => {
    setRange(newRange);
    if (user) {
      try {
        await updateDashboardPreferences(user.id, { defaultRange: newRange });
      } catch (err) {
        console.error("Failed to update preferences:", err);
      }
    }
  };

  if (!isLoaded || loading) {
    return (
      <main className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading dashboard...</div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="text-red-800 font-semibold mb-2">Error</h2>
          <p className="text-red-600 text-sm">{error}</p>
          <p className="text-red-500 text-xs mt-2">
            Make sure the API server is running and you have a user ID mapped in the database.
          </p>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="p-6">
        <div className="text-gray-500">No data available</div>
      </main>
    );
  }

  const weekly = data.weekly || {
    focusMinutes: 0,
    chillMinutes: 0,
    earnedChillMinutes: 0,
  };

  const earnedChill = weekly.earnedChillMinutes || 0;
  const usedChill = weekly.chillMinutes || 0;

  return (
    <div className="min-h-screen bg-white">
      <main className="px-6 py-12 md:px-12 max-w-7xl mx-auto space-y-16">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="space-y-2">
            <h1 className="text-5xl md:text-6xl font-serif font-black text-brand-blue tracking-tight">
              Hello, {user?.firstName || 'Scholar'}
            </h1>
            <p className="text-slate-400 font-medium text-lg md:text-xl">
              {refreshing ? (
                <span className="flex items-center gap-3 animate-pulse text-brand-green">
                  <span className="w-2 h-2 rounded-full bg-brand-green"></span>
                  Syncing your progress...
                </span>
              ) : (
                `You have ${data.assignments?.scheduled?.length || 0} items on your radar.`
              )}
            </p>
          </div>
          
          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-3xl border border-slate-100 shadow-sm self-start">
            <button
              onClick={() => handleRangeChange("day")}
              className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${
                range === "day"
                  ? "bg-white text-brand-blue shadow-md"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              Day
            </button>
            <button
              onClick={() => handleRangeChange("week")}
              className={`px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${
                range === "week"
                  ? "bg-white text-brand-blue shadow-md"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              Week
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          <ProductivitySummary
            daily={data.daily || []}
            weekly={data.weekly}
            range={range}
          />
          <ChillBank
            earnedMinutes={earnedChill}
            usedMinutes={usedChill}
            targetRatio={3.0}
          />
          <div className="hidden lg:block">
            <StreakBadge streak={data.streak} />
          </div>
        </div>

        {data.preferences?.showGradeForecast !== false && (
          <GradeForecast forecasts={data.forecasts || []} />
        )}

        {/* Assignments Section */}
        {data.assignments && (
          <div className="space-y-12">
            <div className="flex items-center gap-4">
              <h2 className="text-3xl font-serif font-black text-brand-blue tracking-tight">Your Roadmap</h2>
              <div className="h-px flex-1 bg-slate-100"></div>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
              <div className="lg:col-span-1 space-y-6">
                <AssignmentsList
                  assignments={data.assignments.inbox || []}
                  title="Capture"
                  emptyMessage="Clear mind, clear inbox. 🕊️"
                />
              </div>
              <div className="lg:col-span-1 space-y-6">
                <AssignmentsList
                  assignments={data.assignments.scheduled || []}
                  title="Focus"
                  emptyMessage="Nothing on deck right now."
                />
              </div>
              <div className="lg:col-span-1 space-y-6">
                <AssignmentsList
                  assignments={data.assignments.completed || []}
                  title="Wins"
                  emptyMessage="Ready for your first win? 🏆"
                />
              </div>
            </div>
          </div>
        )}

        {/* Daily chart visualization */}
        {range === "week" && data.daily && data.daily.length > 0 && (
          <div className="bg-white/70 backdrop-blur-md rounded-3xl border border-slate-100 shadow-xl p-8 transition-all hover:shadow-2xl">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight">Focus Momentum</h3>
                <p className="text-sm font-medium text-slate-400 mt-1">Your cognitive output over the last 7 days</p>
              </div>
              <div className="px-4 py-2 bg-indigo-50 rounded-2xl border border-indigo-100">
                <span className="text-xs font-black text-indigo-600 uppercase tracking-widest">Trend: Stable</span>
              </div>
            </div>
            
            <div className="flex items-end gap-4 h-48 px-2">
              {data.daily.map((day: any, idx: number) => {
                const maxFocus = Math.max(...data.daily.map((d: any) => d.focusMinutes || 0), 1);
                const height = (day.focusMinutes / maxFocus) * 100;
                const isToday = new Date(day.day).toDateString() === new Date().toDateString();
                
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center group">
                    <div className="relative w-full flex flex-col items-center">
                      {/* Tooltip on hover */}
                      <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg z-20 pointer-events-none">
                        {day.focusMinutes}m
                      </div>
                      
                      <div
                        className={`w-full max-w-[40px] rounded-2xl transition-all duration-500 ease-out shadow-sm ${
                          isToday 
                            ? "bg-gradient-to-t from-indigo-600 to-blue-400 shadow-indigo-200 shadow-lg scale-105" 
                            : "bg-slate-100 group-hover:bg-indigo-100"
                        }`}
                        style={{ height: `${Math.max(8, height)}%` }}
                      />
                    </div>
                    <div className={`text-[10px] font-black uppercase tracking-tighter mt-4 ${isToday ? 'text-indigo-600' : 'text-slate-400'}`}>
                      {new Date(day.day).toLocaleDateString("en-US", { weekday: "short" })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

