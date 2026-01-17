"use client";

import React, { useRef, useEffect, useState } from "react";
import { cn } from "../lib/utils";
import { GessoIcon } from "./ui/GessoIcon";
import { Button } from "./ui/button";

interface FlowItem {
  id: string;
  title: string;
  startTime: string; // ISO string or time string
  endTime: string;
  category: "class" | "deep" | "reset" | "due" | "exam" | "wall";
  status: string;
  emoji?: string;
  eventType?: string;
  metadata?: any;
  linkedAssignmentId?: string;
  isMovable?: boolean;
}

interface TodayFlowProps {
  items: FlowItem[];
  onSelect?: (item: FlowItem) => void;
}

export function TodayFlow({ items, onSelect }: TodayFlowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());
  const [highlightedEventIds, setHighlightedEventIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleHighlight = (e: Event) => {
      const detail = (e as CustomEvent).detail as { eventIds?: string[] } | undefined;
      const ids = detail?.eventIds || [];
      setHighlightedEventIds(new Set(ids.map(String)));
    };

    window.addEventListener("highlightFocusBlocks", handleHighlight as EventListener);
    return () => window.removeEventListener("highlightFocusBlocks", handleHighlight as EventListener);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).toLowerCase().replace(" ", "");
  };

  const getCategoryConfig = (category: FlowItem["category"]) => {
    switch (category) {
      case "class":
        return { fg: "text-category-class-fg", bg: "bg-category-class-bg", label: "Class", emoji: "🗣️" };
      case "deep":
        return { fg: "text-category-deep-fg", bg: "bg-category-deep-bg", label: "Deep Work", emoji: "🎯" };
      case "reset":
        return { fg: "text-category-reset-fg", bg: "bg-category-reset-bg", label: "The Reset", emoji: "🌿" };
      case "due":
        return { fg: "text-category-due-fg", bg: "bg-category-due-bg", label: "Due Date", emoji: "📅" };
      case "exam":
        return { fg: "text-category-exam-fg", bg: "bg-category-exam-bg", label: "Exam", emoji: "📝" };
      case "wall":
        return { fg: "text-category-wall-fg", bg: "bg-category-wall-bg", label: "Wall of Awful", emoji: "🧱" };
      default:
        return { fg: "text-brand-muted", bg: "bg-brand-surface-2", label: "Task", emoji: "📌" };
    }
  };

  // Mocking time for visualization if items are empty
  const displayItems = items.length > 0 ? items : [
    { id: "1", title: "Work on: Reading", startTime: "2026-01-14T09:00:00", endTime: "2026-01-14T10:00:00", category: "deep", status: "Scheduled", emoji: "🎯" },
    { id: "2", title: "The Reset", startTime: "2026-01-14T10:00:00", endTime: "2026-01-14T10:30:00", category: "reset", status: "Scheduled", emoji: "🌿" },
    { id: "3", title: "Office Hours: MATH 200", startTime: "2026-01-14T10:30:00", endTime: "2026-01-14T12:30:00", category: "class", status: "Scheduled", emoji: "🗣️" },
    { id: "4", title: "The Reset", startTime: "2026-01-14T12:30:00", endTime: "2026-01-14T12:45:00", category: "reset", status: "Scheduled", emoji: "🌿" },
  ] as FlowItem[];

  // Calculate now marker position (6am = 0%, 8pm = 100%)
  const getNowPosition = () => {
    const hours = now.getHours() + now.getMinutes() / 60;
    // Timeline spans 6am (6) to 8pm (20) = 14 hours
    const startHour = 6;
    const endHour = 20;
    if (hours < startHour) return 0;
    if (hours > endHour) return 100;
    return ((hours - startHour) / (endHour - startHour)) * 100;
  };

  const nowPosition = getNowPosition();
  const currentHour = now.getHours();
  const isWithinTimeline = currentHour >= 6 && currentHour < 20;

  return (
    <div className="w-full bg-brand-surface-2/50 rounded-[2.5rem] p-8 space-y-8 cozy-border">
      {/* Time Markers with Now Line */}
      <div className="relative px-4">
        <div className="flex justify-between text-[13px] font-bold text-brand-muted uppercase tracking-wider">
          {["6am", "8am", "10am", "12pm", "2pm", "4pm", "6pm", "8pm"].map((time) => {
            const timeHour = parseInt(time) + (time.includes("pm") && !time.includes("12") ? 12 : 0);
            const isCurrentHour = currentHour === timeHour || (time === "12pm" && currentHour === 12);
            return (
              <span key={time} className={cn(isCurrentHour && "text-category-deep-fg")}>{time}</span>
            );
          })}
        </div>
        
        {/* Now Marker Line - positioned on timeline */}
        {isWithinTimeline && (
          <div 
            className="absolute top-1/2 -translate-y-1/2 z-10 flex flex-col items-center pointer-events-none"
            style={{ left: `calc(${nowPosition}% - 4px)` }}
          >
            <div className="w-3 h-3 rounded-full bg-category-deep-fg" />
            <div className="w-[2px] h-8 bg-category-deep-fg" />
          </div>
        )}
      </div>

      <div 
        ref={scrollRef}
        className="flex gap-6 overflow-x-auto pb-6 snap-x snap-mandatory no-scrollbar relative"
      >

        {displayItems.map((item) => {
          const config = getCategoryConfig(item.category);
          const start = new Date(item.startTime);
          const end = new Date(item.endTime);
          const isNow = now >= start && now <= end;
          const isHighlighted = highlightedEventIds.has(String(item.id));

          return (
            <div 
              key={item.id}
              className={cn(
                "min-w-[300px] p-8 rounded-[2rem] snap-center transition-all duration-500",
                config.bg,
                "cozy-border shadow-soft",
                isNow && "ring-2 ring-category-reset-fg animate-pulse-soft",
                isHighlighted && "ring-4 ring-category-deep-fg shadow-aura-green"
              )}
              onClick={() => onSelect?.(item)}
            >
              <div className="space-y-6">
                <div className="flex justify-between items-start">
                  <div className="space-y-3">
                    <span className="text-[24px]">{item.emoji || config.emoji}</span>
                    <div className={cn("meta-label", config.fg)}>
                      {config.label}
                    </div>
                  </div>
                  {isNow && (
                    <span className="bg-category-reset-fg/20 text-category-reset-fg text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
                      NOW
                    </span>
                  )}
                </div>

                <h4 className="text-[22px] font-serif font-black text-brand-text leading-tight">
                  {item.title}
                </h4>

                <div className="flex items-center justify-between">
                  <span className="text-brand-muted font-medium text-sm">
                    {formatTime(new Date(item.startTime))} → {formatTime(new Date(item.endTime))}
                  </span>
                  
                  {isNow && (
                    <Button size="sm" className="bg-category-reset-fg hover:bg-category-reset-fg/90 text-white rounded-full px-6">
                      Now
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="text-center text-[12px] font-bold text-brand-muted uppercase tracking-[0.2em]">
        ← Swipe to flow through your day →
      </div>
    </div>
  );
}

