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
    <main className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          {refreshing && (
            <span className="text-sm text-gray-500 animate-pulse">
              Refreshing...
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => loadDashboard(false)}
            disabled={refreshing}
            className="px-3 py-1 rounded text-sm bg-green-600 text-white hover:bg-green-700 disabled:bg-green-400 transition-colors"
            title="Refresh dashboard data"
          >
            {refreshing ? '↻' : '↻ Refresh'}
          </button>
          <button
            onClick={() => handleRangeChange("day")}
            className={`px-3 py-1 rounded text-sm ${
              range === "day"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Day
          </button>
          <button
            onClick={() => handleRangeChange("week")}
            className={`px-3 py-1 rounded text-sm ${
              range === "week"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Week
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
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
        <div className="mb-6">
          <GradeForecast forecasts={data.forecasts || []} />
        </div>
      )}

      {/* Assignments Section */}
      {data.assignments && (
        <div className="mb-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <AssignmentsList
              assignments={data.assignments.inbox || []}
              title="Inbox"
              emptyMessage="No assignments in inbox"
            />
            <AssignmentsList
              assignments={data.assignments.scheduled || []}
              title="Scheduled"
              emptyMessage="No scheduled assignments"
            />
            <AssignmentsList
              assignments={data.assignments.completed || []}
              title="Recently Completed"
              emptyMessage="No completed assignments"
            />
          </div>
        </div>
      )}

      {/* Daily chart placeholder */}
      {range === "week" && data.daily && data.daily.length > 0 && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Last 7 Days</h3>
          <div className="flex items-end gap-2 h-32">
            {data.daily.map((day: any, idx: number) => {
              const maxFocus = Math.max(...data.daily.map((d: any) => d.focusMinutes || 0));
              const height = maxFocus > 0 ? (day.focusMinutes / maxFocus) * 100 : 0;
              return (
                <div key={idx} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full bg-blue-500 rounded-t transition-all"
                    style={{ height: `${height}%` }}
                  />
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(day.day).toLocaleDateString("en-US", { weekday: "short" })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}

