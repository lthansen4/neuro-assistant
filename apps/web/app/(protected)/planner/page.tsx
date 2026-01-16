// apps/web/app/(protected)/planner/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { BookOpen, ClipboardList, Flame, Search, Loader2, GraduationCap } from "lucide-react";
import { cn } from "../../../lib/utils";
import { ReadingView } from "../../../components/Planner/ReadingView";
import { HomeworkView } from "../../../components/Planner/HomeworkView";
import { TestView } from "../../../components/Planner/TestView";
import { ClassView } from "../../../components/Planner/ClassView";
import { AssignmentEditModal } from "../../../components/AssignmentEditModal";
import { FocusTimerModal } from "../../../components/FocusTimerModal";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "https://gessoapi-production.up.railway.app";

type ViewType = "reading" | "homework" | "tests" | "classes";

export default function PlannerPage() {
  const { user, isLoaded } = useUser();
  const [activeView, setActiveView] = useState<ViewType>("homework");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<any>(null);
  const [focusTarget, setFocusTarget] = useState<{
    assignmentId?: string | null;
    title?: string;
    category?: string | null;
    totalPages?: number | null;
    pagesCompleted?: number | null;
  } | null>(null);

  const fetchSummary = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch(`${API_BASE}/api/planner/summary?tz=${userTz}`, {
        headers: { "x-clerk-user-id": user.id },
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to fetch planner summary");
      }
      const result = await res.json();
      setData(result.summary);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoaded && user) {
      fetchSummary();
    }
  }, [isLoaded, user]);

  if (!isLoaded || loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="animate-spin text-brand-primary" size={40} />
        <p className="text-brand-muted font-bold uppercase tracking-widest text-xs">Organizing your world...</p>
      </div>
    );
  }

  const tabs = [
    { id: "homework", label: "Homework", icon: ClipboardList },
    { id: "reading", label: "Reading", icon: BookOpen },
    { id: "tests", label: "Tests", icon: Flame },
    { id: "classes", label: "By Class", icon: GraduationCap },
  ];

  return (
    <main className="px-6 py-8 md:px-12 md:py-12 max-w-7xl mx-auto space-y-8 relative z-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-4xl md:text-6xl font-serif font-black text-brand-text italic">
            Planner
          </h1>
          <p className="text-brand-muted font-medium">Focus on what matters most right now.</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-brand-surface-2 p-1.5 rounded-[2rem] cozy-border shadow-inner self-start">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id as ViewType)}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-[1.5rem] transition-all duration-300 text-xs font-black uppercase tracking-widest",
                activeView === tab.id 
                  ? "bg-brand-surface text-brand-primary shadow-soft scale-105" 
                  : "text-brand-muted hover:text-brand-text"
              )}
            >
              <tab.icon size={16} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="mt-8">
        {error && (
          <div className="text-center py-20 bg-brand-rose/5 rounded-[2rem] border border-dashed border-brand-rose/20 animate-fade-in">
            <p className="text-brand-rose font-bold mb-2">Something went wrong</p>
            <p className="text-brand-muted text-sm mb-6 max-w-md mx-auto">{error}</p>
            <button 
              onClick={fetchSummary} 
              className="px-6 py-3 bg-brand-primary text-white rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 transition-all shadow-md"
            >
              Try Again
            </button>
          </div>
        )}

        {!error && !data && !loading && (
          <div className="text-center py-20 bg-brand-surface-2/30 rounded-[2rem] border border-dashed border-brand-border">
            <p className="text-brand-muted font-medium">No data available. Try refreshing.</p>
          </div>
        )}

        {!error && data && activeView === "reading" && data.reading && (
          <ReadingView 
            data={data.reading} 
            onSelect={(a) => setSelectedAssignment(a)}
            onFocus={(a) => setFocusTarget({
              assignmentId: a.id,
              title: a.title,
              category: "Reading",
              totalPages: a.totalPages,
              pagesCompleted: a.pagesCompleted
            })}
          />
        )}
        {!error && data && activeView === "homework" && data.homework && (
          <HomeworkView 
            data={data.homework} 
            onSelect={(a) => setSelectedAssignment(a)}
            onFocus={(a) => setFocusTarget({
              assignmentId: a.id,
              title: a.title,
              category: a.category || "Homework"
            })}
          />
        )}
        {!error && data && activeView === "tests" && data.tests && (
          <TestView 
            data={data.tests} 
            onSelect={(a) => setSelectedAssignment(a)}
            onFocus={(a) => setFocusTarget({
              assignmentId: a.id,
              title: a.title,
              category: a.category || "Exam"
            })}
          />
        )}
        {!error && data && activeView === "classes" && (
          <ClassView 
            data={[
              ...Object.values(data.homework || {}).flat(),
              ...Object.values(data.reading || {}).flat(),
              ...(data.tests || [])
            ]} 
            onSelect={(a) => setSelectedAssignment(a)}
            onFocus={(a) => setFocusTarget({
              assignmentId: a.id,
              title: a.title,
              category: a.category,
              totalPages: a.totalPages,
              pagesCompleted: a.pagesCompleted
            })}
          />
        )}
      </div>

      {/* Edit Modal */}
      {selectedAssignment && (
        <AssignmentEditModal
          assignment={{
            ...selectedAssignment,
            status: selectedAssignment.status, // Ensure status is correctly typed
          }}
          userId={user!.id}
          onClose={() => setSelectedAssignment(null)}
          onUpdated={() => {
            setSelectedAssignment(null);
            fetchSummary();
          }}
          onDeleted={() => {
            setSelectedAssignment(null);
            fetchSummary();
          }}
        />
      )}

      {focusTarget && user && (
        <FocusTimerModal
          userId={user.id}
          assignmentId={focusTarget.assignmentId}
          title={focusTarget.title}
          category={focusTarget.category}
          currentPagesCompleted={focusTarget.pagesCompleted}
          totalPages={focusTarget.totalPages}
          onClose={() => setFocusTarget(null)}
          onLogged={() => {
            setFocusTarget(null);
            fetchSummary();
          }}
        />
      )}
    </main>
  );
}

