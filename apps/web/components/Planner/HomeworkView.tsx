// apps/web/components/Planner/HomeworkView.tsx
"use client";

import { cn } from "../../lib/utils";
import { ClipboardList, Clock, Calendar, AlertCircle, CalendarRange } from "lucide-react";
import Link from "next/link";
import { Progress } from "../ui/progress";

interface HomeworkAssignment {
  id: string;
  title: string;
  dueDate: string | null;
  courseId: string | null;
  courseName: string | null;
  category: string | null;
  completionPercentage?: number;
  totalProblems?: number;
  problemsCompleted?: number;
}

interface HomeworkViewProps {
  data: {
    overdue: HomeworkAssignment[];
    today: HomeworkAssignment[];
    tomorrow: HomeworkAssignment[];
    thisWeek: HomeworkAssignment[];
    nextWeek: HomeworkAssignment[];
    later: HomeworkAssignment[];
  };
  onSelect: (assignment: HomeworkAssignment) => void;
  onFocus: (assignment: HomeworkAssignment) => void;
}

export function HomeworkView({ data, onSelect, onFocus }: HomeworkViewProps) {
  const sections = [
    { title: "Overdue", items: data.overdue, isOverdue: true },
    { title: "Today", items: data.today },
    { title: "Tomorrow", items: data.tomorrow },
    { title: "This Week", items: data.thisWeek },
    { title: "Next Week", items: data.nextWeek },
    { title: "Later", items: data.later },
  ];

  return (
    <div className="space-y-8 pb-12">
      {sections.map((section) => (
        <div key={section.title} className="space-y-4">
          {section.items.length > 0 && (
            <>
              <h3 className={cn(
                "text-xs font-black uppercase tracking-[0.2em] px-2",
                section.isOverdue ? "text-brand-rose" : "text-brand-muted"
              )}>
                {section.title}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {section.items.map((item) => (
                  <HomeworkCard 
                    key={item.id} 
                    item={item} 
                    onClick={() => onSelect(item)} 
                    onFocus={() => onFocus(item)}
                    isOverdue={section.isOverdue}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ))}

      {sections.every(s => s.items.length === 0) && (
        <div className="text-center py-20 bg-brand-surface-2/30 rounded-[2rem] border border-dashed border-brand-border">
          <ClipboardList className="mx-auto mb-4 text-brand-muted opacity-20" size={48} />
          <p className="text-brand-muted font-medium">No homework assignments found.</p>
        </div>
      )}
    </div>
  );
}

function HomeworkCard({ item, onClick, onFocus, isOverdue }: { item: HomeworkAssignment; onClick: () => void; onFocus: () => void; isOverdue?: boolean }) {
  // Calculate progress
  let progress = item.completionPercentage || 0;
  if (!item.completionPercentage && item.totalProblems) {
    progress = Math.round(((item.problemsCompleted || 0) / item.totalProblems) * 100);
  }

  return (
    <div 
      className={cn(
        "group relative p-6 rounded-[2rem] bg-brand-surface border border-brand-border/40 shadow-soft hover:-translate-y-1 transition-all duration-300 cursor-pointer overflow-hidden",
        isOverdue ? "hover:shadow-aura-rose border-brand-rose/20 bg-rose-50/10" : "hover:shadow-aura-violet"
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4" onClick={onClick}>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-category-deep-fg bg-category-deep-bg px-2 py-0.5 rounded-md uppercase tracking-wider">
              {item.courseName || "Homework"}
            </span>
            <h4 className="text-lg font-bold text-brand-text leading-tight group-hover:text-brand-primary transition-colors line-clamp-2">
              {item.title}
            </h4>
          </div>
          <div className={cn(
            "w-10 h-10 rounded-2xl flex items-center justify-center",
            isOverdue ? "bg-brand-rose/10 text-brand-rose" : "bg-brand-surface-2 text-brand-muted"
          )}>
            {isOverdue ? <AlertCircle size={20} /> : <ClipboardList size={20} />}
          </div>
        </div>

        {(progress > 0 || item.totalProblems) && (
          <div className="space-y-2" onClick={onClick}>
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-brand-muted">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-1.5 bg-brand-surface-2" />
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-brand-border/20">
          <div className="text-[10px] font-bold uppercase tracking-widest">
            {item.dueDate && (
              <span className={cn(
                "flex items-center gap-1.5",
                isOverdue ? "text-brand-rose" : "text-brand-muted"
              )}>
                <Calendar size={12} />
                {new Date(item.dueDate).toLocaleDateString()}
              </span>
            )}
            {isOverdue && (
              <span className="text-brand-rose flex items-center gap-1 font-black ml-2">
                OVERDUE
              </span>
            )}
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFocus();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-md"
          >
            <Clock size={12} strokeWidth={3} />
            Lock In
          </button>
          
          <Link
            href={`/calendar?assignmentId=${item.id}`}
            className="flex items-center justify-center w-10 h-10 bg-brand-surface-2 text-brand-muted rounded-xl hover:text-brand-primary hover:bg-brand-primary/10 transition-all shadow-sm"
            title="Show on Calendar"
            onClick={(e) => e.stopPropagation()}
          >
            <CalendarRange size={18} />
          </Link>
        </div>
      </div>
    </div>
  );
}

