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

// Timeline config: 24 hours starting at 7am (wraps to next day)
const START_HOUR = 7; // 7am
const TOTAL_HOURS = 24;
const HOUR_WIDTH_PX = 120; // Width per hour in pixels
const TIMELINE_WIDTH_PX = TOTAL_HOURS * HOUR_WIDTH_PX; // Total scrollable width

export function TodayFlow({ items, onSelect }: TodayFlowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nowMarkerRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(new Date());
  const [highlightedEventIds, setHighlightedEventIds] = useState<Set<string>>(new Set());

  // Update current time every minute
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll to current time on mount
  useEffect(() => {
    if (scrollRef.current && nowMarkerRef.current) {
      const containerWidth = scrollRef.current.clientWidth;
      const nowPosition = getNowPixelPosition();
      // Center the now marker in the viewport
      const scrollTo = Math.max(0, nowPosition - containerWidth / 2);
      scrollRef.current.scrollLeft = scrollTo;
    }
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

  // Convert hour to pixel position (relative to START_HOUR)
  const getHourPixelPosition = (hour: number) => {
    // Handle wrap-around: hours before START_HOUR are at the end of the timeline
    let adjustedHour = hour - START_HOUR;
    if (adjustedHour < 0) adjustedHour += 24;
    return adjustedHour * HOUR_WIDTH_PX;
  };

  // Get current time position in pixels
  const getNowPixelPosition = () => {
    const hours = now.getHours() + now.getMinutes() / 60;
    return getHourPixelPosition(hours);
  };

  // Generate time markers for 24 hours starting at 7am
  const timeMarkers = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => {
    const hour = (START_HOUR + i) % 24;
    const isPM = hour >= 12;
    const display12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return {
      hour,
      label: `${display12}${isPM ? 'pm' : 'am'}`,
      position: i * HOUR_WIDTH_PX,
    };
  });

  // Mocking time for visualization if items are empty
  const displayItems = items.length > 0 ? items : [
    { id: "1", title: "Work on: Reading", startTime: "2026-01-14T09:00:00", endTime: "2026-01-14T10:00:00", category: "deep", status: "Scheduled", emoji: "🎯" },
    { id: "2", title: "The Reset", startTime: "2026-01-14T10:00:00", endTime: "2026-01-14T10:30:00", category: "reset", status: "Scheduled", emoji: "🌿" },
    { id: "3", title: "Office Hours: MATH 200", startTime: "2026-01-14T10:30:00", endTime: "2026-01-14T12:30:00", category: "class", status: "Scheduled", emoji: "🗣️" },
    { id: "4", title: "The Reset", startTime: "2026-01-14T12:30:00", endTime: "2026-01-14T12:45:00", category: "reset", status: "Scheduled", emoji: "🌿" },
  ] as FlowItem[];

  const currentHour = now.getHours();
  const nowPixelPosition = getNowPixelPosition();

  // Calculate vertical positions to avoid overlaps
  const calculateEventLevels = (events: FlowItem[]) => {
    // Sort events by start time
    const sorted = [...events].sort((a, b) => 
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
    );
    
    // Track which levels are occupied at what times
    const levels: Array<{ endTime: number; events: FlowItem[] }> = [];
    const eventLevels = new Map<string, number>();
    
    for (const event of sorted) {
      const startTime = new Date(event.startTime).getTime();
      const endTime = new Date(event.endTime).getTime();
      
      // Find the first level where this event doesn't overlap
      let assignedLevel = -1;
      for (let i = 0; i < levels.length; i++) {
        if (levels[i].endTime <= startTime) {
          // This level is free, use it
          assignedLevel = i;
          levels[i] = { endTime, events: [...levels[i].events, event] };
          break;
        }
      }
      
      // If no free level found, create a new one
      if (assignedLevel === -1) {
        assignedLevel = levels.length;
        levels.push({ endTime, events: [event] });
      }
      
      eventLevels.set(event.id, assignedLevel);
    }
    
    return { eventLevels, maxLevel: levels.length - 1 };
  };

  const { eventLevels, maxLevel } = calculateEventLevels(displayItems);
  const LEVEL_HEIGHT = 220; // Height per level in pixels
  const LEVEL_GAP = 20; // Gap between levels

  return (
    <div className="w-full bg-brand-surface-2/50 rounded-[2.5rem] p-8 space-y-4 cozy-border">
      {/* Scrollable Timeline Container */}
      <div 
        ref={scrollRef}
        className="overflow-x-auto no-scrollbar"
      >
        <div 
          className="relative"
          style={{ 
            width: `${TIMELINE_WIDTH_PX}px`, 
            minHeight: `${(maxLevel + 1) * LEVEL_HEIGHT + maxLevel * LEVEL_GAP + 80}px` 
          }}
        >
          {/* Time Markers Row */}
          <div className="flex h-8 mb-4">
            {timeMarkers.map(({ hour, label, position }) => (
              <div 
                key={`marker-${hour}-${position}`}
                className="absolute text-[13px] font-bold uppercase tracking-wider"
                style={{ left: `${position}px` }}
              >
                <span className={cn(
                  "text-brand-muted",
                  hour === currentHour && "text-category-deep-fg"
                )}>
                  {label}
                </span>
              </div>
            ))}
          </div>

          {/* Now Marker Line - vertical line at current time */}
          <div 
            ref={nowMarkerRef}
            className="absolute top-0 bottom-0 z-20 flex flex-col items-center pointer-events-none"
            style={{ left: `${nowPixelPosition}px` }}
          >
            <div className="w-3 h-3 rounded-full bg-category-deep-fg mt-1" />
            <div className="w-[2px] flex-1 bg-category-deep-fg" />
          </div>

          {/* Cards Container */}
          <div className="flex gap-6 pt-2">
            {displayItems.map((item) => {
              const config = getCategoryConfig(item.category);
              const start = new Date(item.startTime);
              const end = new Date(item.endTime);
              const isNow = now >= start && now <= end;
              const isHighlighted = highlightedEventIds.has(String(item.id));

              // Position card based on start time
              const startHour = start.getHours() + start.getMinutes() / 60;
              const cardLeft = getHourPixelPosition(startHour);
              
              // Get vertical level for this event to avoid overlaps
              const level = eventLevels.get(item.id) || 0;
              const cardTop = 40 + level * (LEVEL_HEIGHT + LEVEL_GAP);

              return (
                <div 
                  key={item.id}
                  className={cn(
                    "absolute min-w-[280px] p-6 rounded-[2rem] transition-all duration-500 cursor-pointer",
                    config.bg,
                    "cozy-border shadow-soft",
                    isNow && "ring-2 ring-category-reset-fg animate-pulse-soft",
                    isHighlighted && "ring-4 ring-category-deep-fg shadow-aura-green"
                  )}
                  style={{ 
                    left: `${cardLeft}px`,
                    top: `${cardTop}px`
                  }}
                  onClick={() => onSelect?.(item)}
                >
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2">
                        <span className="text-[20px]">{item.emoji || config.emoji}</span>
                        <div className={cn("meta-label text-xs", config.fg)}>
                          {config.label}
                        </div>
                      </div>
                      {isNow && (
                        <span className="bg-category-reset-fg/20 text-category-reset-fg text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
                          NOW
                        </span>
                      )}
                    </div>

                    <h4 className="text-[18px] font-serif font-black text-brand-text leading-tight">
                      {item.title}
                    </h4>

                    <div className="flex items-center justify-between">
                      <span className="text-brand-muted font-medium text-sm">
                        {formatTime(start)} → {formatTime(end)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="text-center text-[12px] font-bold text-brand-muted uppercase tracking-[0.2em]">
        ← Swipe to flow through your day →
      </div>
    </div>
  );
}

