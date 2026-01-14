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
    <div className="min-h-screen bg-slate-50/50">
      <main className="p-8 max-w-7xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tight">
              Hello, {user?.firstName || 'Scholar'} 👋
            </h1>
            <p className="text-slate-500 font-medium mt-1">
              {refreshing ? (
                <span className="flex items-center gap-2 animate-pulse text-indigo-500">
                  <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                  Syncing your latest progress...
                </span>
              ) : (
                `You've got ${data.assignments?.scheduled?.length || 0} items on your radar this week.`
              )}
            </p>
          </div>
          
          <div className="flex items-center gap-3 bg-white/50 backdrop-blur-sm p-1.5 rounded-2xl border border-slate-200/60 shadow-sm">
            <button
              onClick={() => handleRangeChange("day")}
              className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                range === "day"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              Day
            </button>
            <button
              onClick={() => handleRangeChange("week")}
              className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                range === "week"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-200"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              Week
            </button>
            <div className="w-px h-4 bg-slate-200 mx-1"></div>
            <button
              onClick={() => loadDashboard(false)}
              disabled={refreshing}
              className="p-2 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all disabled:opacity-50"
              title="Refresh dashboard"
            >
              <svg className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <ProductivitySummary
            daily={data.daily || []}
            weekly={data.weekly}
            range={range}
          />
          <StreakBadge streak={data.streak} />
          {data.preferences?.showChillBank !== false && (
            <ChillBank
              earnedMinutes={earnedChill}
              usedMinutes={usedChill}
              targetRatio={2.5}
            />
          )}
        </div>

        {data.preferences?.showGradeForecast !== false && (
          <GradeForecast forecasts={data.forecasts || []} />
        )}

        {/* Assignments Section */}
        {data.assignments && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <AssignmentsList
                assignments={data.assignments.inbox || []}
                title="Input Buffer"
                emptyMessage="Inbox is clear. Nice work! 🕊️"
              />
            </div>
            <div className="lg:col-span-1">
              <AssignmentsList
                assignments={data.assignments.scheduled || []}
                title="Active Focus"
                emptyMessage="Nothing scheduled yet."
              />
            </div>
            <div className="lg:col-span-1">
              <AssignmentsList
                assignments={data.assignments.completed || []}
                title="Wins"
                emptyMessage="Complete a task to see it here! 🏆"
              />
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

