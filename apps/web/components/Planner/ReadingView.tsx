// apps/web/components/Planner/ReadingView.tsx
"use client";

import { cn } from "../../lib/utils";
import { BookOpen, Clock, Calendar, CheckCircle2, CalendarRange } from "lucide-react";
import { Progress } from "../ui/progress";
import Link from "next/link";

interface ReadingAssignment {
  id: string;
  title: string;
  dueDate: string | null;
  courseId: string | null;
  courseName: string | null;
  totalPages: number | null;
  pagesCompleted: number | null;
  completionPercentage?: number;
}

interface ReadingViewProps {
  data: {
    today: ReadingAssignment[];
    tomorrow: ReadingAssignment[];
    thisWeek: ReadingAssignment[];
    thisMonth: ReadingAssignment[];
    later: ReadingAssignment[];
  };
  onSelect: (assignment: ReadingAssignment) => void;
  onFocus: (assignment: ReadingAssignment) => void;
}

export function ReadingView({ data, onSelect, onFocus }: ReadingViewProps) {
  const sections = [
    { title: "Today", items: data.today },
    { title: "Tomorrow", items: data.tomorrow },
    { title: "This Week", items: data.thisWeek },
    { title: "This Month", items: data.thisMonth },
    { title: "Later", items: data.later },
  ];

  return (
    <div className="space-y-8 pb-12">
      {sections.map((section) => (
        <div key={section.title} className="space-y-4">
          {section.items.length > 0 && (
            <>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-brand-muted px-2">
                {section.title}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {section.items.map((item) => (
                  <ReadingCard 
                    key={item.id} 
                    item={item} 
                    onClick={() => onSelect(item)} 
                    onFocus={() => onFocus(item)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      ))}
      
      {sections.every(s => s.items.length === 0) && (
        <div className="text-center py-20 bg-brand-surface-2/30 rounded-[2rem] border border-dashed border-brand-border">
          <BookOpen className="mx-auto mb-4 text-brand-muted opacity-20" size={48} />
          <p className="text-brand-muted font-medium">No reading assignments found.</p>
        </div>
      )}
    </div>
  );
}

function ReadingCard({ item, onClick, onFocus }: { item: ReadingAssignment; onClick: () => void; onFocus: () => void }) {
  // Calculate progress: prioritize completionPercentage
  let progress = item.completionPercentage || 0;
  if (!item.completionPercentage && item.totalPages) {
    progress = Math.round(((item.pagesCompleted || 0) / item.totalPages) * 100);
  }
  
  return (
    <div 
      className="group relative p-6 rounded-[2rem] bg-brand-surface border border-brand-border/40 shadow-soft hover:shadow-aura-green hover:-translate-y-1 transition-all duration-300 cursor-pointer overflow-hidden"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4" onClick={onClick}>
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-category-deep-fg bg-category-deep-bg px-2 py-0.5 rounded-md uppercase tracking-wider">
              {item.courseName || "Reading"}
            </span>
            <h4 className="text-lg font-bold text-brand-text leading-tight group-hover:text-brand-primary transition-colors">
              {item.title}
            </h4>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-category-deep-bg flex items-center justify-center text-category-deep-fg">
            <BookOpen size={20} />
          </div>
        </div>

        <div className="space-y-2" onClick={onClick}>
          <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-brand-muted">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2 bg-brand-surface-2" indicatorClassName="bg-category-deep-fg" />
          <div className="flex justify-between text-[10px] font-medium text-brand-muted">
            <span>{item.pagesCompleted || 0} pages done</span>
            <span>{item.totalPages || "?"} total</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-brand-border/20">
          <div className="text-[10px] font-bold text-brand-muted uppercase tracking-widest">
            {item.dueDate && (
              <span className="flex items-center gap-1.5">
                <Calendar size={12} />
                {new Date(item.dueDate).toLocaleDateString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFocus();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-category-deep-fg text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all"
            >
              <Clock size={12} strokeWidth={3} />
              Lock In
            </button>

            <Link
              href={`/calendar?assignmentId=${item.id}`}
              className="flex items-center justify-center w-8 h-8 bg-brand-surface-2 text-brand-muted rounded-lg hover:text-brand-primary hover:bg-brand-primary/10 transition-all shadow-sm"
              title="Show on Calendar"
              onClick={(e) => e.stopPropagation()}
            >
              <CalendarRange size={14} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

