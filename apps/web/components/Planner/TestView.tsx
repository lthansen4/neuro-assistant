// apps/web/components/Planner/TestView.tsx
"use client";

import { cn } from "../../lib/utils";
import { Flame, Calendar, Clock, AlertTriangle, CalendarRange } from "lucide-react";
import Link from "next/link";

interface TestAssignment {
  id: string;
  title: string;
  dueDate: string | null;
  courseId: string | null;
  courseName: string | null;
  category: string | null;
  daysRemaining: number | null;
}

interface TestViewProps {
  data: TestAssignment[];
  onSelect: (assignment: TestAssignment) => void;
  onFocus: (assignment: TestAssignment) => void;
}

export function TestView({ data, onSelect, onFocus }: TestViewProps) {
  // Sort tests by date (soonest first)
  const sortedTests = [...data].sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  return (
    <div className="space-y-6 pb-12">
      {sortedTests.length > 0 ? (
        <div className="grid grid-cols-1 gap-6">
          {sortedTests.map((test) => (
            <TestCard 
              key={test.id} 
              item={test} 
              onClick={() => onSelect(test)} 
              onFocus={() => onFocus(test)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-brand-surface-2/30 rounded-[2rem] border border-dashed border-brand-border">
          <Flame className="mx-auto mb-4 text-brand-muted opacity-20" size={48} />
          <p className="text-brand-muted font-medium">No tests or exams scheduled. Nice! 🕊️</p>
        </div>
      )}
    </div>
  );
}

function TestCard({ item, onClick, onFocus }: { item: TestAssignment; onClick: () => void; onFocus: () => void }) {
  const isUrgent = item.daysRemaining !== null && item.daysRemaining <= 3;
  
  return (
    <div 
      className={cn(
        "group relative p-8 rounded-[2.5rem] bg-brand-surface border-2 transition-all duration-500 cursor-pointer overflow-hidden",
        isUrgent 
          ? "border-category-exam-fg/30 shadow-aura-exam" 
          : "border-brand-border/40 shadow-soft hover:shadow-aura-violet"
      )}
    >
      {/* Background Glow for Urgent */}
      {isUrgent && (
        <div className="absolute top-0 right-0 w-64 h-64 bg-category-exam-bg/40 blur-[80px] -mr-32 -mt-32 pointer-events-none" />
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
        <div className="space-y-3 flex-1" onClick={onClick}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-[0.2em] bg-category-exam-bg text-category-exam-fg border border-category-exam-fg/20">
              {item.category || "Exam"}
            </span>
            {item.courseName && (
              <span className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">
                {item.courseName}
              </span>
            )}
          </div>
          <h4 className="text-2xl font-black text-brand-text leading-tight group-hover:text-brand-primary transition-colors">
            {item.title}
          </h4>
          <div className="flex items-center gap-4 text-xs font-bold text-brand-muted uppercase tracking-widest">
            {item.dueDate && (
              <span className="flex items-center gap-1.5">
                <Calendar size={14} className="text-brand-primary" />
                {new Date(item.dueDate).toLocaleDateString("en-US", { 
                  weekday: 'long', 
                  month: 'short', 
                  day: 'numeric' 
                })}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFocus();
            }}
            className={cn(
              "flex items-center gap-2 px-6 py-4 rounded-[1.5rem] text-sm font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg mr-4",
              isUrgent ? "bg-white text-category-exam-fg" : "bg-category-exam-fg text-white"
            )}
          >
            <Clock size={18} strokeWidth={3} />
            Study
          </button>

          <Link
            href={`/calendar?assignmentId=${item.id}`}
            className="flex items-center justify-center w-12 h-12 bg-brand-surface-2 text-brand-muted rounded-[1rem] hover:text-brand-primary hover:bg-brand-primary/10 transition-all shadow-sm mr-4"
            title="Show on Calendar"
            onClick={(e) => e.stopPropagation()}
          >
            <CalendarRange size={22} />
          </Link>

          <div className={cn(
            "px-6 py-4 rounded-[2rem] flex flex-col items-center justify-center min-w-[120px]",
            isUrgent ? "bg-category-exam-fg text-white shadow-lg" : "bg-brand-surface-2 text-brand-text"
          )} onClick={onClick}>
            <span className="text-2xl font-black leading-none">
              {item.daysRemaining !== null ? (item.daysRemaining < 0 ? 0 : item.daysRemaining) : "?"}
            </span>
            <span className="text-[8px] font-black uppercase tracking-[0.3em] mt-1 opacity-80">
              Days Left
            </span>
          </div>
          
          <div className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center transition-transform duration-500 group-hover:scale-110",
            isUrgent ? "bg-category-exam-bg text-category-exam-fg" : "bg-brand-surface-2 text-brand-muted"
          )} onClick={onClick}>
            <Flame size={24} className={cn(isUrgent && "animate-pulse")} />
          </div>
        </div>
      </div>
    </div>
  );
}

