"use client";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { fetchDashboardSummary, fetchDashboardPreferences, updateDashboardPreferences, fetchCalendarEvents } from "../../../lib/api";
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
import { AssignmentEditModal } from "../../../components/AssignmentEditModal";
import { EventDetailsModal } from "../../../components/EventDetailsModal";
import { FocusTimerModal } from "../../../components/FocusTimerModal";
import { Button } from "../../../components/ui/button";

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

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  extendedProps?: {
    eventType?: string;
    type?: string;
    isMovable?: boolean;
    linkedAssignmentId?: string;
    metadata?: any;
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
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<{
    id: string;
    title: string;
    start: Date;
    end: Date;
    eventType: string;
    isMovable: boolean;
    metadata?: any;
    linkedAssignmentId?: string;
  } | null>(null);
  const [focusTarget, setFocusTarget] = useState<{
    assignmentId?: string | null;
    title?: string;
  } | null>(null);
  const [topTab, setTopTab] = useState<"top" | "today" | "week" | "all">("top");
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

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
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      const eventsResponse = await fetchCalendarEvents(userId, startOfToday, endOfToday).catch(() => ({ events: [] }));
      setCalendarEvents(eventsResponse?.events || []);
      
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

  const flowFromCalendar = calendarEvents.map((evt) => {
    const eventType = evt.extendedProps?.eventType || evt.extendedProps?.type || "Other";
    const lower = eventType.toLowerCase();
    const category =
      lower.includes("class") || lower.includes("office")
        ? "class"
        : lower.includes("chill") || lower.includes("reset") || lower.includes("transition")
        ? "reset"
        : lower.includes("due")
        ? "due"
        : lower.includes("exam") || lower.includes("test") || lower.includes("quiz") || lower.includes("midterm") || lower.includes("final")
        ? "exam"
        : "deep";
    return {
      id: evt.id,
      title: evt.title,
      startTime: evt.start,
      endTime: evt.end,
      category,
      status: "Scheduled",
      eventType,
      metadata: evt.extendedProps?.metadata,
      linkedAssignmentId: evt.extendedProps?.linkedAssignmentId,
      isMovable: evt.extendedProps?.isMovable ?? false,
    };
  });

  const allAssignments = (() => {
    const merged = [
      ...(data.assignments?.scheduled || []),
      ...(data.assignments?.inbox || []),
      ...(data.assignments?.completed || []),
    ];
    const seen = new Map<string, Assignment>();
    for (const item of merged) {
      if (!seen.has(item.id)) seen.set(item.id, item);
    }
    return Array.from(seen.values()).sort((a, b) => {
      const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });
  })();

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);

  const top3Assignments = (data.assignments?.scheduled || [])
    .slice()
    .sort((a, b) => {
      const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .slice(0, 3);

  const todayAssignments = allAssignments.filter((a) => {
    if (!a.dueDate) return false;
    const due = new Date(a.dueDate);
    return due >= startOfToday && due < endOfToday;
  });

  const weekAssignments = allAssignments.filter((a) => {
    if (!a.dueDate) return false;
    const due = new Date(a.dueDate);
    return due >= startOfToday && due < endOfWeek;
  });

  return (
    <div className="min-h-screen bg-brand-gesso selection:bg-brand-primary/10 selection:text-brand-primary">
      <div className="fixed inset-0 gesso-texture z-0 pointer-events-none" />

      {/* Sticky Quick Add (Top) */}
      <div className="sticky top-0 z-30 bg-brand-gesso/80 backdrop-blur-md pt-8 pb-4 px-6 md:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col gap-6 md:flex-row md:items-center">
            <div className="flex-1">
              <QuickAddInput />
            </div>
          </div>
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

          <TodayFlow
            items={(flowFromCalendar.length > 0 ? flowFromCalendar : (flowItems as any))}
            onSelect={(item) => {
              const fallbackStart = new Date(item.startTime);
              const fallbackEnd = new Date(item.endTime);
              setSelectedEvent({
                id: item.id,
                title: item.title,
                start: fallbackStart,
                end: fallbackEnd,
                eventType: item.eventType || "Other",
                isMovable: item.isMovable ?? true,
                metadata: item.metadata,
                linkedAssignmentId: item.linkedAssignmentId,
              });
            }}
          />
        </div>

        {/* Bento Grid (Bottom) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8">
            <div className="bg-brand-surface p-8 rounded-[2.5rem] cozy-border shadow-soft h-full">
              <div className="flex flex-col md:flex-row gap-8">
                <div className="flex md:flex-col gap-2 md:min-w-[140px]">
                  {[
                    { id: "top", label: "Top 3", hint: "Next up" },
                    { id: "today", label: "Today", hint: "Due today" },
                    { id: "week", label: "This week", hint: "Next 7 days" },
                    { id: "all", label: "All", hint: "Everything" },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setTopTab(tab.id as typeof topTab)}
                      className={cn(
                        "flex flex-col items-start rounded-2xl border px-4 py-3 text-left transition-all",
                        topTab === tab.id
                          ? "bg-brand-surface-2 border-brand-border shadow-soft"
                          : "border-transparent text-brand-muted hover:text-brand-text hover:bg-brand-surface-2/60"
                      )}
                    >
                      <span className="text-[12px] font-black uppercase tracking-[0.2em]">
                        {tab.label}
                      </span>
                      <span className="text-[11px] font-medium text-brand-muted">
                        {tab.hint}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="flex-1 space-y-6">
                  <div className="space-y-2">
                    <h3 className="card-title text-brand-text italic">
                      {topTab === "top"
                        ? "The Top 3"
                        : topTab === "today"
                        ? "Due Today"
                        : topTab === "week"
                        ? "This Week"
                        : "All Assignments"}
                    </h3>
                    <span className="meta-label text-brand-muted">
                      {topTab === "top"
                        ? "Focus Priority"
                        : topTab === "today"
                        ? "What needs you today"
                        : topTab === "week"
                        ? "Upcoming deadlines"
                        : "Everything in your system"}
                    </span>
                  </div>

                  <AssignmentsList
                    assignments={
                      topTab === "top"
                        ? top3Assignments
                        : topTab === "today"
                        ? todayAssignments
                        : topTab === "week"
                        ? weekAssignments
                        : allAssignments
                    }
                    title=""
                    hideHeader
                    emptyMessage={
                      topTab === "top"
                        ? "Nothing on deck right now."
                        : topTab === "today"
                        ? "Nothing due today."
                        : topTab === "week"
                        ? "Nothing due this week."
                        : "No assignments yet."
                    }
                    onSelect={(assignment) => setSelectedAssignment(assignment)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-4">
            {user && (
              <ChillBank
                userId={user.id}
                earnedMinutes={earnedChill}
                usedMinutes={usedChill}
                targetRatio={3.0}
                onSessionLogged={() => loadDashboard(false)}
              />
            )}
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

        {selectedAssignment && user && (
          <AssignmentEditModal
            assignment={selectedAssignment}
            userId={user.id}
            onClose={() => setSelectedAssignment(null)}
            onUpdated={() => {
              setSelectedAssignment(null);
              loadDashboard(false);
            }}
            onDeleted={() => {
              setSelectedAssignment(null);
              loadDashboard(false);
            }}
          />
        )}

        {selectedEvent && user && (
          <EventDetailsModal
            event={selectedEvent}
            userId={user.id}
            onClose={() => setSelectedEvent(null)}
            onDeleted={() => {
              setSelectedEvent(null);
              loadDashboard(false);
            }}
          />
        )}

        {focusTarget && user && (
          <FocusTimerModal
            userId={user.id}
            assignmentId={focusTarget.assignmentId}
            title={focusTarget.title}
            onClose={() => setFocusTarget(null)}
            onLogged={() => {
              setFocusTarget(null);
              loadDashboard(false);
            }}
          />
        )}
      </main>
    </div>
  );
}
