// apps/web/components/Planner/CourseView.tsx
"use client";

import { cn } from "../../lib/utils";
import { GraduationCap, ClipboardList, BookOpen, Flame, Clock, Calendar, CalendarRange } from "lucide-react";
import Link from "next/link";
import { Progress } from "../ui/progress";

interface CourseViewProps {
  data: any[];
  onSelect: (assignment: any) => void;
  onFocus: (assignment: any) => void;
}

export function CourseView({ data, onSelect, onFocus }: CourseViewProps) {
  // Group assignments by courseName
  const grouped = data.reduce((acc: any, item: any) => {
    const course = item.courseName || "Other / General";
    if (!acc[course]) acc[course] = [];
    acc[course].push(item);
    return acc;
  }, {});

  const courseNames = Object.keys(grouped).sort();

  return (
    <div className="space-y-12 pb-12 animate-fade-in">
      {courseNames.map((course) => (
        <div key={course} className="space-y-6">
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-2xl bg-brand-primary/10 text-brand-primary flex items-center justify-center">
              <GraduationCap size={20} />
            </div>
            <h3 className="text-xl font-serif font-black text-brand-text italic">
              {course}
            </h3>
            <div className="h-px flex-1 bg-brand-border/40 ml-2" />
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-muted bg-brand-surface-2 px-3 py-1 rounded-full">
              {grouped[course].length} {grouped[course].length === 1 ? 'Task' : 'Tasks'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {grouped[course].map((item: any) => (
              <SimpleAssignmentCard 
                key={item.id} 
                item={item} 
                onClick={() => onSelect(item)} 
                onFocus={() => onFocus(item)}
              />
            ))}
          </div>
        </div>
      ))}

      {data.length === 0 && (
        <div className="text-center py-20 bg-brand-surface-2/30 rounded-[2rem] border border-dashed border-brand-border">
          <GraduationCap className="mx-auto mb-4 text-brand-muted opacity-20" size={48} />
          <p className="text-brand-muted font-medium">No assignments found for any courses.</p>
        </div>
      )}
    </div>
  );
}

function SimpleAssignmentCard({ item, onClick, onFocus }: { item: any; onClick: () => void; onFocus: () => void }) {
  const categoryStr = (item.category || "").toLowerCase();
  const isTest = categoryStr.match(/test|exam|quiz|midterm|final/);
  const isReading = categoryStr.match(/reading|read/);
  
  const icon = isTest ? <Flame size={18} /> : isReading ? <BookOpen size={18} /> : <ClipboardList size={18} />;
  const colorClass = isTest 
    ? "text-category-exam-fg bg-category-exam-bg" 
    : isReading 
      ? "text-category-deep-fg bg-category-deep-bg" 
      : "text-brand-primary bg-brand-surface-2";
  
  const progress = item.totalPages ? Math.round(((item.pagesCompleted || 0) / item.totalPages) * 100) : null;

  return (
    <div className="group relative p-6 rounded-[2rem] bg-brand-surface border border-brand-border/40 shadow-soft hover:-translate-y-1 transition-all duration-300 cursor-pointer overflow-hidden">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4" onClick={onClick}>
          <div className="space-y-1">
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider", colorClass)}>
              {item.category || "Assignment"}
            </span>
            <h4 className="text-lg font-bold text-brand-text leading-tight group-hover:text-brand-primary transition-colors">
              {item.title}
            </h4>
          </div>
          <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center", colorClass)}>
            {icon}
          </div>
        </div>

        {isReading && item.totalPages && (
          <div className="space-y-2" onClick={onClick}>
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-brand-muted">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress || 0} className="h-1.5 bg-brand-surface-2" />
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-brand-border/20">
          <div className="text-[10px] font-bold text-brand-muted uppercase tracking-widest flex items-center gap-1.5">
            {item.dueDate && (
              <>
                <Calendar size={12} />
                {new Date(item.dueDate).toLocaleDateString()}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
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
    </div>
  );
}

