"use client";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { fetchDashboardSummary, fetchDashboardPreferences, updateDashboardPreferences } from "../../../lib/api";
import { ChillBank } from "../../../components/ChillBank";
import { GradeForecast } from "../../../components/GradeForecast";
import { StreakBadge } from "../../../components/StreakBadge";
import { ProductivitySummary } from "../../../components/ProductivitySummary";
import { AssignmentsList } from "../../../components/AssignmentsList";
import { TodayFlow } from "../../../components/TodayFlow";
import { QuickAddInput } from "../../../components/QuickAddInput";
import { StuckRadar } from "../../../components/StuckRadar";
import { WeekSummary } from "../../../components/WeekSummary";
import { cn } from "../../../lib/utils";

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
  deferralCount?: number;
  isStuck?: boolean;
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
      
      setData(summary);
      setLastRefresh(new Date());
    } catch (err: any) {
      setError(err.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isLoaded || !user) {
      if (isLoaded && !user) setLoading(false);
      return;
    }
    loadDashboard(true);
  }, [user, isLoaded, range]);

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
      <main className="p-6 bg-brand-gesso min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
          <div className="text-brand-muted font-medium">Preparing your canvas...</div>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="p-6 bg-brand-gesso min-h-screen">
        <div className="bg-rose-50 border border-rose-100 rounded-3xl p-8 max-w-lg mx-auto mt-20 text-center space-y-4">
          <h2 className="text-rose-800 font-serif font-black text-3xl">Something went wrong</h2>
          <p className="text-rose-600 font-medium">{error || "No data available"}</p>
          <button 
            onClick={() => loadDashboard(true)}
            className="bg-white text-rose-800 px-8 py-3 rounded-full font-bold shadow-sm border border-rose-100 hover:bg-rose-50 transition-colors"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  const weekly = data.weekly || { focusMinutes: 0, chillMinutes: 0, earnedChillMinutes: 0 };
  const earnedChill = weekly.earnedChillMinutes || 0;
  const usedChill = weekly.chillMinutes || 0;

  const flowItems = (data.assignments?.scheduled || []).map(a => ({
    id: a.id,
    title: a.title,
    startTime: a.dueDate || new Date().toISOString(),
    endTime: a.dueDate ? new Date(new Date(a.dueDate).getTime() + 60*60*1000).toISOString() : new Date().toISOString(),
    category: (a.category?.toLowerCase().includes('read') || a.category?.toLowerCase().includes('homework')) ? 'deep' :
              (a.category?.toLowerCase().includes('chill')) ? 'reset' :
              (a.category?.toLowerCase().includes('test') || a.category?.toLowerCase().includes('exam')) ? 'exam' : 'deep',
    status: a.status,
  }));

  const [topTab, setTopTab] = useState<"top" | "all">("top");
  const allAssignments = (() => {
    const merged = [
      ...(data.assignments?.scheduled || []),
      ...(data.assignments?.inbox || []),
      ...(data.assignments?.completed || []),
    ];
    const seen = new Map<string, any>();
    for (const item of merged) {
      if (!seen.has(item.id)) seen.set(item.id, item);
    }
    return Array.from(seen.values());
  })();

  return (
    <div className="min-h-screen bg-brand-gesso selection:bg-brand-primary/10 selection:text-brand-primary">
      <div className="fixed inset-0 gesso-texture z-0 pointer-events-none" />

      {/* Sticky Quick Add (Top) */}
      <div className="sticky top-0 z-30 bg-brand-gesso/80 backdrop-blur-md pt-8 pb-4 px-6 md:px-12">
        <div className="max-w-7xl mx-auto">
          <QuickAddInput />
        </div>
      </div>

      <main className="px-6 py-12 md:px-12 md:py-16 max-w-7xl mx-auto space-y-32 relative z-10">
        <div className="space-y-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-12">
            <div className="space-y-6">
              <h1 className="text-6xl md:text-[7rem] font-serif font-black text-brand-text tracking-tighter leading-[0.8]">
                {refreshing ? "Scanning..." : `Hey, ${user?.firstName || 'Scholar'}.`}
              </h1>
              <p className="text-brand-muted font-medium text-xl md:text-3xl">
                {data.assignments?.scheduled?.length === 0 ? "Your radar is clear. Go touch grass. 🌿" : `You've got ${data.assignments?.scheduled?.length || 0} items on deck today.`}
              </p>
            </div>
            
            <div className="flex items-center gap-2 bg-brand-surface-2 p-1.5 rounded-full cozy-border self-start">
              <button onClick={() => handleRangeChange("day")} className={`px-8 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.1em] transition-all ${range === "day" ? "bg-brand-surface text-brand-text shadow-soft" : "text-brand-muted hover:text-brand-text"}`}>Day</button>
              <button onClick={() => handleRangeChange("week")} className={`px-8 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.1em] transition-all ${range === "week" ? "bg-brand-surface text-brand-text shadow-soft" : "text-brand-muted hover:text-brand-text"}`}>Week</button>
            </div>
          </div>

          <TodayFlow items={flowItems as any} />
        </div>

        {/* Bento Grid (Bottom) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8">
            <div className="bg-brand-surface p-8 rounded-[2.5rem] cozy-border shadow-soft h-full space-y-8">
              <div className="flex items-start justify-between gap-6">
                <div className="space-y-2">
                  <h3 className="card-title text-brand-text italic">
                    {topTab === "top" ? "The Top 3" : "All Assignments"}
                  </h3>
                  <span className="meta-label text-brand-muted">
                    {topTab === "top" ? "Focus Priority" : "Everything in your system"}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button
                    onClick={() => setTopTab("top")}
                    className={cn(
                      "px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-[0.2em] transition-all",
                      topTab === "top"
                        ? "bg-brand-surface-2 text-brand-text shadow-soft"
                        : "text-brand-muted hover:text-brand-text"
                    )}
                  >
                    Top 3
                  </button>
                  <button
                    onClick={() => setTopTab("all")}
                    className={cn(
                      "px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-[0.2em] transition-all",
                      topTab === "all"
                        ? "bg-brand-surface-2 text-brand-text shadow-soft"
                        : "text-brand-muted hover:text-brand-text"
                    )}
                  >
                    All
                  </button>
                </div>
              </div>
              <AssignmentsList
                assignments={
                  topTab === "top"
                    ? (data.assignments?.scheduled || []).slice(0, 3)
                    : allAssignments
                }
                title=""
                hideHeader
                emptyMessage={topTab === "top" ? "Nothing on deck right now." : "No assignments yet."}
              />
            </div>
          </div>

          <div className="lg:col-span-4">
            <ChillBank earnedMinutes={earnedChill} usedMinutes={usedChill} targetRatio={3.0} />
          </div>

          <div className="lg:col-span-4">
            <StuckRadar assignments={[...(data.assignments?.scheduled || []), ...(data.assignments?.inbox || [])]} />
          </div>

          <div className="lg:col-span-4">
            <WeekSummary 
              completedCount={data.assignments?.completed?.length || 0}
              totalScheduled={(data.assignments?.scheduled?.length || 0) + (data.assignments?.completed?.length || 0)}
            />
          </div>

          <div className="lg:col-span-4">
            <StreakBadge streak={data.streak} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <ProductivitySummary daily={data.daily || []} weekly={data.weekly} range={range} />
          {data.preferences?.showGradeForecast !== false && <GradeForecast forecasts={data.forecasts || []} />}
        </div>
      </main>
    </div>
  );
}
