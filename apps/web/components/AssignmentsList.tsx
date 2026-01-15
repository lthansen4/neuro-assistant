// components/AssignmentsList.tsx
"use client";

import { cn } from "../lib/utils";

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

interface AssignmentsListProps {
  assignments: Assignment[];
  title: string;
  emptyMessage?: string;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "No due date";
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return `${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? "s" : ""} ago`;
    } else if (diffDays === 0) {
      return "Today";
    } else if (diffDays === 1) {
      return "Tomorrow";
    } else if (diffDays <= 7) {
      return `In ${diffDays} days`;
    } else {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
    }
  } catch {
    return dateString;
  }
}

function getCategoryColor(category: string | null): string {
  if (!category) return "bg-slate-100 text-slate-500";
  const cat = category.toLowerCase();
  if (cat.includes("read")) return "bg-rainbow-reading text-orange-800";
  if (cat.includes("homework") || cat.includes("assignment")) return "bg-rainbow-homework text-brand-green";
  if (cat.includes("test") || cat.includes("exam") || cat.includes("quiz")) return "bg-rainbow-tests text-blue-800";
  if (cat.includes("chill")) return "bg-rainbow-chill text-purple-800";
  if (cat.includes("note")) return "bg-rainbow-notes text-yellow-800";
  return "bg-slate-100 text-slate-500";
}

function formatEffort(minutes: number | null): string {
  if (!minutes) return "";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function AssignmentsList({ assignments, title, emptyMessage = "No assignments" }: AssignmentsListProps) {
  if (assignments.length === 0) {
    return (
      <div className="bg-slate-50/50 rounded-3xl border border-dashed border-slate-200 p-12 text-center">
        <h3 className="text-sm font-black text-slate-300 uppercase tracking-[0.2em] mb-2">{title}</h3>
        <p className="text-slate-400 font-medium italic">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-2">
        <h3 className="text-xs font-black text-slate-300 uppercase tracking-[0.3em]">{title}</h3>
        <span className="text-[10px] font-black text-brand-green/50 bg-brand-green/5 px-2 py-0.5 rounded-full uppercase tracking-widest">
          {assignments.length} {assignments.length === 1 ? "Item" : "Items"}
        </span>
      </div>
      
      <div className="grid grid-cols-1 gap-4">
        {assignments.map((assignment) => {
          const dueDateFormatted = formatDate(assignment.dueDate);
          const effortFormatted = formatEffort(assignment.effortEstimateMinutes);
          const isOverdue = assignment.dueDate && new Date(assignment.dueDate) < new Date() && assignment.status !== "Completed";

          return (
            <div 
              key={assignment.id} 
              className={cn(
                "group relative p-6 rounded-3xl transition-all duration-500 cursor-pointer active:scale-[0.98]",
                "bg-white border border-slate-100 shadow-sm hover:shadow-xl hover:border-slate-200",
                isOverdue && "border-rose-100 bg-rose-50/10"
              )}
            >
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {assignment.category && (
                        <span className={cn(
                          "text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest leading-none",
                          getCategoryColor(assignment.category)
                        )}>
                          {assignment.category}
                        </span>
                      )}
                      {assignment.courseName && (
                        <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none">
                          {assignment.courseName}
                        </span>
                      )}
                    </div>
                    <h4 className="text-xl font-serif font-black text-slate-800 leading-tight group-hover:text-brand-green transition-colors">
                      {assignment.title}
                    </h4>
                  </div>
                  
                  <div className={cn(
                    "w-12 h-12 rounded-2xl flex items-center justify-center border transition-all duration-500 shadow-inner",
                    assignment.status === "Completed" 
                      ? "bg-brand-green/10 border-brand-green/20 text-brand-green" 
                      : "bg-slate-50 border-slate-100 text-slate-300 group-hover:bg-brand-green/5 group-hover:border-brand-green/10"
                  )}>
                    {assignment.status === "Completed" ? (
                      <CheckIcon size={20} strokeWidth={3} />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-current"></div>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-50/50">
                  <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest">
                    <span className={cn(
                      "flex items-center gap-1.5",
                      isOverdue ? "text-rose-500" : "text-slate-400"
                    )}>
                      <CalendarIcon size={12} strokeWidth={3} />
                      {dueDateFormatted}
                    </span>
                    {effortFormatted && (
                      <span className="text-slate-300 flex items-center gap-1.5">
                        <ClockIcon size={12} strokeWidth={3} />
                        {effortFormatted}
                      </span>
                    )}
                  </div>
                  
                  <div className="text-[9px] font-black text-slate-300 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                    View Details →
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const CheckIcon = ({ size, strokeWidth }: { size: number, strokeWidth: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const CalendarIcon = ({ size, strokeWidth }: { size: number, strokeWidth: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const ClockIcon = ({ size, strokeWidth }: { size: number, strokeWidth: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);
