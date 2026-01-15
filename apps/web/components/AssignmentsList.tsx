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
    const seniorPeerEmptyMessages: Record<string, string> = {
      "Capture": "Scanning for chaos... Okay, your mind is clear. 🕊️",
      "Focus": "Nothing on deck. Go touch grass. 🌿",
      "Wins": "Ready to crush something? 🏆",
    };

    return (
      <div className="bg-white/40 backdrop-blur-sm rounded-[2.5rem] border border-dashed border-slate-300 p-12 text-center shadow-inner">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-3">{title}</h3>
        <p className="text-slate-500 font-medium italic text-sm">
          {seniorPeerEmptyMessages[title] || emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between px-4">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">{title}</h3>
        <span className="text-[10px] font-black text-brand-green bg-white px-3 py-1 rounded-full uppercase tracking-widest shadow-sm border border-slate-100">
          {assignments.length} {assignments.length === 1 ? "Item" : "Items"}
        </span>
      </div>
      
      <div className="grid grid-cols-1 gap-5">
        {assignments.map((assignment) => {
          const dueDateFormatted = formatDate(assignment.dueDate);
          const effortFormatted = formatEffort(assignment.effortEstimateMinutes);
          const isOverdue = assignment.dueDate && new Date(assignment.dueDate) < new Date() && assignment.status !== "Completed";
          const wallOfAwful = (assignment.deferralCount || 0) >= 3 || assignment.isStuck;

          return (
            <div 
              key={assignment.id} 
              className={cn(
                "group relative p-8 rounded-[2.5rem] transition-all duration-700 cursor-pointer active:scale-[0.98]",
                "bg-white border border-slate-200/50 shadow-sm hover:shadow-2xl hover:border-slate-300",
                wallOfAwful && "bg-rainbow-chill/20 border-rainbow-chill/30 animate-vibrate shadow-aura-violet",
                isOverdue && !wallOfAwful && "border-rose-200 bg-rose-50/20"
              )}
            >
              <div className="flex flex-col gap-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      {assignment.category && (
                        <span className={cn(
                          "text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest leading-none shadow-sm border",
                          getCategoryColor(assignment.category)
                        )}>
                          {assignment.category}
                        </span>
                      )}
                      {assignment.courseName && (
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                          {assignment.courseName}
                        </span>
                      )}
                    </div>
                    <h4 className="text-2xl font-serif font-black text-slate-800 leading-tight group-hover:text-brand-green transition-colors tracking-tight">
                      {assignment.title}
                    </h4>
                    {wallOfAwful && (
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] font-black text-purple-700 uppercase tracking-widest animate-pulse">
                          The wall is tall today. Let's micro-chunk this.
                        </span>
                      </div>
                    )}
                  </div>
                  
                  <div className={cn(
                    "w-14 h-14 rounded-[1.5rem] flex items-center justify-center border transition-all duration-700 shadow-sm",
                    assignment.status === "Completed" 
                      ? "bg-brand-green text-white border-brand-green shadow-aura-moss" 
                      : wallOfAwful 
                        ? "bg-white border-purple-200 text-purple-600 shadow-aura-violet"
                        : "bg-slate-50 border-slate-200 text-slate-300 group-hover:bg-brand-green group-hover:text-white group-hover:border-brand-green group-hover:shadow-aura-moss"
                  )}>
                    {assignment.status === "Completed" ? (
                      <CheckCircle2 size={28} strokeWidth={2.5} />
                    ) : wallOfAwful ? (
                      <GessoIcon type="brick" size={28} />
                    ) : (
                      <GessoIcon type={
                        assignment.category?.toLowerCase().includes("read") ? "wave" :
                        assignment.category?.toLowerCase().includes("homework") ? "bolt" :
                        assignment.category?.toLowerCase().includes("test") ? "flame" :
                        "bolt"
                      } size={28} />
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100/50">
                  <div className="flex items-center gap-5 text-[10px] font-black uppercase tracking-widest">
                    <span className={cn(
                      "flex items-center gap-2",
                      isOverdue ? "text-rose-500" : "text-slate-500"
                    )}>
                      <CalendarIcon size={14} strokeWidth={2.5} />
                      {dueDateFormatted}
                    </span>
                    {effortFormatted && (
                      <span className="text-slate-400 flex items-center gap-2 bg-slate-50 px-2 py-1 rounded-lg">
                        <Clock size={14} strokeWidth={2.5} />
                        {effortFormatted}
                      </span>
                    )}
                  </div>
                  
                  <div className="text-[10px] font-black text-brand-green uppercase tracking-[0.2em] opacity-0 group-hover:opacity-100 transition-opacity">
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
