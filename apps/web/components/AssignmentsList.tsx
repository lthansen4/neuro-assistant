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

function getCategoryConfig(category: string | null) {
  if (!category) return { bg: "bg-slate-50", text: "text-slate-400", icon: "bolt" as const };
  const cat = category.toLowerCase();
  if (cat.includes("read")) return { bg: "bg-rainbow-reading", text: "text-accent-reading", icon: "wave" as const };
  if (cat.includes("homework") || cat.includes("assignment")) return { bg: "bg-rainbow-homework", text: "text-accent-homework", icon: "bolt" as const };
  if (cat.includes("test") || cat.includes("exam") || cat.includes("quiz")) return { bg: "bg-rainbow-tests", text: "text-accent-tests", icon: "flame" as const };
  if (cat.includes("chill")) return { bg: "bg-rainbow-chill", text: "text-accent-chill", icon: "wave" as const };
  if (cat.includes("note")) return { bg: "bg-rainbow-notes", text: "text-accent-notes", icon: "inkblot" as const };
  return { bg: "bg-slate-50", text: "text-slate-400", icon: "bolt" as const };
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
    const seniorPeerEmptyMessages: Record<string, string> = {
      "Capture": "Scanning for chaos... Okay, your mind is clear. 🕊️",
      "Focus": "Nothing on deck. Go touch grass. 🌿",
      "Wins": "Ready to crush something? 🏆",
    };

    return (
      <div className="bg-white/20 backdrop-blur-sm rounded-[3rem] border border-dashed border-slate-200 p-16 text-center">
        <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.4em] mb-4">{title}</h3>
        <p className="text-slate-400 font-medium italic text-sm">
          {seniorPeerEmptyMessages[title] || emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between px-6">
        <h3 className="text-[10px] font-black text-slate-300 uppercase tracking-[0.5em]">{title}</h3>
        <span className="text-[10px] font-black text-brand-green bg-white/60 px-4 py-1.5 rounded-full uppercase tracking-[0.2em] shadow-sm border border-white/50">
          {assignments.length} {assignments.length === 1 ? "Item" : "Items"}
        </span>
      </div>
      
      <div className="grid grid-cols-1 gap-6">
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
                "group relative p-10 rounded-[3.5rem] transition-all duration-500 cursor-pointer active:scale-[0.98]",
                "bg-white/40 backdrop-blur-sm border border-white/60 hover:bg-white hover:shadow-2xl hover:border-white hover:-translate-y-1",
                wallOfAwful && "bg-rainbow-chill/30 border-rainbow-chill/40 animate-vibrate shadow-aura-violet",
                isOverdue && !wallOfAwful && "border-rose-100 bg-rose-50/10"
              )}
            >
              <div className="flex flex-col gap-8">
                <div className="flex items-start justify-between gap-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      {assignment.category && (
                        <span className={cn(
                          "text-[10px] font-black px-4 py-1.5 rounded-full uppercase tracking-[0.2em] leading-none shadow-sm",
                          config.bg, config.text
                        )}>
                          {assignment.category}
                        </span>
                      )}
                      {assignment.courseName && (
                        <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] leading-none px-2">
                          {assignment.courseName}
                        </span>
                      )}
                    </div>
                    <h4 className="text-3xl font-serif font-black text-brand-blue leading-tight tracking-tight group-hover:text-brand-green transition-colors">
                      {assignment.title}
                    </h4>
                    {wallOfAwful && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] font-black text-purple-400 uppercase tracking-[0.3em] animate-pulse">
                          The wall is tall today. Let's micro-chunk this.
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className={cn(
                    "w-16 h-16 rounded-[1.8rem] flex items-center justify-center border transition-all duration-500 shadow-sm",
                    assignment.status === "Completed" 
                      ? "bg-brand-green text-white border-brand-green" 
                      : wallOfAwful 
                        ? "bg-white border-purple-100 text-purple-500 shadow-aura-violet"
                        : cn("bg-white border-white group-hover:bg-brand-green group-hover:text-white group-hover:border-brand-green", config.text)
                  )}>
                    {assignment.status === "Completed" ? (
                      <CheckCircle2 size={32} strokeWidth={2.5} />
                    ) : wallOfAwful ? (
                      <GessoIcon type="brick" size={32} />
                    ) : (
                      <GessoIcon type={config.icon} size={32} />
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-6 border-t border-slate-100/50">
                  <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-[0.3em]">
                    <span className={cn(
                      "flex items-center gap-2",
                      isOverdue ? "text-rose-400" : "text-slate-300"
                    )}>
                      <CalendarIcon size={14} strokeWidth={2.5} />
                      {dueDateFormatted}
                    </span>
                    {effortFormatted && (
                      <span className="text-slate-300 flex items-center gap-2">
                        <Clock size={14} strokeWidth={2.5} />
                        {effortFormatted}
                      </span>
                    )}
                  </div>
                  
                  <div className="text-[10px] font-black text-brand-green uppercase tracking-[0.4em] opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                    {wallOfAwful ? "Micro-Chunk →" : "Dive In →"}
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
    </div>
  );
}
