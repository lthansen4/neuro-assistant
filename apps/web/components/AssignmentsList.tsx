// components/AssignmentsList.tsx
"use client";

import { cn } from "../lib/utils";
import { GessoIcon } from "./ui/GessoIcon";
import { Clock, Calendar as CalendarIcon, CheckCircle2 } from "lucide-react";

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
  pointsEarned?: number | null;
  pointsPossible?: number | null;
  graded?: boolean;
}

interface AssignmentsListProps {
  assignments: Assignment[];
  title: string;
  emptyMessage?: string;
  hideHeader?: boolean;
  onSelect?: (assignment: Assignment) => void;
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

function getCategoryConfig(category: string | null) {
  if (!category) return { bg: "bg-brand-surface-2", text: "text-brand-muted", icon: "bolt" as const, label: "Task" };
  const cat = category.toLowerCase();
  if (cat.includes("read") || cat.includes("homework")) return { bg: "bg-category-deep-bg", text: "text-category-deep-fg", icon: "bolt" as const, label: "Deep Work" };
  if (cat.includes("class") || cat.includes("office")) return { bg: "bg-category-class-bg", text: "text-category-class-fg", icon: "prism" as const, label: "Class" };
  if (cat.includes("test") || cat.includes("exam") || cat.includes("quiz")) return { bg: "bg-category-exam-bg", text: "text-category-exam-fg", icon: "flame" as const, label: "Exam" };
  if (cat.includes("chill") || cat.includes("reset")) return { bg: "bg-category-reset-bg", text: "text-category-reset-fg", icon: "wave" as const, label: "The Reset" };
  if (cat.includes("due")) return { bg: "bg-category-due-bg", text: "text-category-due-fg", icon: "inkblot" as const, label: "Due Date" };
  return { bg: "bg-brand-surface-2", text: "text-brand-muted", icon: "bolt" as const, label: "Task" };
}

function formatEffort(minutes: number | null): string {
  if (!minutes) return "";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function AssignmentsList({
  assignments,
  title,
  emptyMessage = "No assignments",
  hideHeader = false,
  onSelect,
}: AssignmentsListProps) {
  if (assignments.length === 0) {
    const seniorPeerEmptyMessages: Record<string, string> = {
      "Capture": "Scanning for chaos... Okay, your mind is clear. 🕊️",
      "Focus": "Nothing on deck. Go touch grass. 🌿",
      "Wins": "Ready to crush something? 🏆",
    };

    return (
      <div className="bg-brand-surface-2/30 rounded-[2rem] border border-dashed border-brand-muted/20 p-12 text-center">
        {!hideHeader && <h3 className="meta-label text-brand-muted mb-4">{title}</h3>}
        <p className="text-brand-muted font-medium italic text-sm">
          {seniorPeerEmptyMessages[title] || emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!hideHeader && (
        <div className="flex items-center justify-between px-2">
          <h3 className="meta-label text-brand-muted">{title}</h3>
          <span className="text-[10px] font-bold text-brand-primary bg-brand-primary/10 px-3 py-1 rounded-full uppercase tracking-widest border border-brand-primary/20">
            {assignments.length} {assignments.length === 1 ? "Item" : "Items"}
          </span>
        </div>
      )}
      
      <div className="grid grid-cols-1 gap-4">
        {assignments.map((assignment) => {
          const dueDateFormatted = formatDate(assignment.dueDate);
          const effortFormatted = formatEffort(assignment.effortEstimateMinutes);
          const isOverdue = assignment.dueDate && new Date(assignment.dueDate) < new Date() && assignment.status !== "Completed";
          const wallOfAwful = (assignment.deferralCount || 0) >= 3 || assignment.isStuck;
          const config = getCategoryConfig(assignment.category);

          return (
            <div 
              key={assignment.id} 
              className={cn(
                "group relative p-6 rounded-[1.5rem] transition-all duration-300 cursor-pointer active:scale-[0.98]",
                "bg-brand-surface cozy-border hover:shadow-soft hover:-translate-y-0.5",
                wallOfAwful && "bg-category-wall-bg ring-1 ring-category-wall-fg/20 shadow-aura-violet",
                isOverdue && !wallOfAwful && "bg-rose-50/30 border-rose-100"
              )}
              onClick={() => onSelect?.(assignment)}
            >
              <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider",
                        config.bg, config.text
                      )}>
                        {config.label}
                      </span>
                      {assignment.courseName && (
                        <span className="text-[10px] font-medium text-brand-muted truncate max-w-[100px]">
                          {assignment.courseName}
                        </span>
                      )}
                    </div>
                    <h4 className="text-[18px] font-bold text-brand-text leading-tight group-hover:text-brand-primary transition-colors">
                      {assignment.title}
                    </h4>
                  </div>
                  
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300",
                    assignment.status === "Completed" 
                      ? "bg-brand-primary text-white" 
                      : wallOfAwful 
                        ? "bg-category-wall-bg text-category-wall-fg border border-category-wall-fg/20"
                        : "bg-brand-surface-2 text-brand-muted group-hover:bg-brand-primary/10 group-hover:text-brand-primary"
                  )}>
                    {assignment.status === "Completed" ? (
                      <CheckCircle2 size={20} strokeWidth={2.5} />
                    ) : (
                      <GessoIcon type={wallOfAwful ? "brick" : config.icon} size={20} />
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-brand-surface-2">
                  <div className="flex items-center gap-4 text-[11px] font-bold text-brand-muted uppercase tracking-wide">
                    <span className={cn("flex items-center gap-1.5", isOverdue && "text-brand-rose")}>
                      <CalendarIcon size={12} strokeWidth={2.5} />
                      {dueDateFormatted}
                    </span>
                    {effortFormatted && (
                      <span className="flex items-center gap-1.5">
                        <Clock size={12} strokeWidth={2.5} />
                        {effortFormatted}
                      </span>
                    )}
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
