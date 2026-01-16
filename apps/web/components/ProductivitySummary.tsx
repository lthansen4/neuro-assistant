// components/ProductivitySummary.tsx
"use client";

import { CircularProgress } from "./ui/CircularProgress";
import { cn } from "../lib/utils";

interface DailyProductivity {
  day: string;
  focusMinutes: number;
  chillMinutes: number;
  earnedChillMinutes: number;
}

interface WeeklyProductivity {
  focusMinutes: number;
  chillMinutes: number;
  earnedChillMinutes: number;
  startDate: string;
  endDate: string;
}

interface ProductivitySummaryProps {
  daily: DailyProductivity[];
  weekly: WeeklyProductivity | null;
  range: "day" | "week";
}

export function ProductivitySummary({ daily, weekly, range }: ProductivitySummaryProps) {
  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const sumFocus = (items: DailyProductivity[]) =>
    items.reduce((total, item) => total + (item.focusMinutes || 0), 0);

  const todayFocus = daily.length ? daily[daily.length - 1]?.focusMinutes || 0 : 0;
  const last7 = daily.slice(-7);
  const last30 = daily.slice(-30);
  const avgPerDay = daily.length ? sumFocus(daily) / daily.length : 0;
  const avgWeek = last7.length ? sumFocus(last7) / last7.length : 0;
  const avgMonth = last30.length ? sumFocus(last30) / last30.length : 0;

  const getStats = () => {
  if (range === "day") {
    const today = daily[daily.length - 1];
      return today ? {
        focus: today.focusMinutes,
        chill: today.chillMinutes,
        earned: today.earnedChillMinutes,
        label: "Daily Focus"
      } : null;
    }
    return weekly ? {
      focus: weekly.focusMinutes,
      chill: weekly.chillMinutes,
      earned: weekly.earnedChillMinutes,
      label: "Weekly Focus"
    } : null;
  };

  const stats = getStats();

  if (!stats) {
    return (
      <div className="bg-brand-surface p-8 rounded-[2.5rem] cozy-border shadow-soft h-full flex flex-col justify-center items-center text-center space-y-2">
        <h3 className="card-title text-brand-text italic">
          {range === "day" ? "Daily" : "Weekly"} Focus
        </h3>
        <p className="text-brand-muted font-medium text-sm italic">Finding your data...</p>
      </div>
    );
  }

  const focusTarget = range === "day" ? 240 : 1200;
  const focusColor = "#6D5EF7"; // brand-primary
  const bgColor = "#F6F2EA"; // brand-surface-2

  return (
    <div className="bg-brand-surface p-8 rounded-[2.5rem] cozy-border shadow-soft hover:shadow-2xl transition-all duration-500 group h-full flex flex-col justify-between">
      <div className="flex flex-col items-center">
        <div className="w-full flex justify-between items-center mb-6">
          <h3 className="card-title text-brand-text italic">{stats.label}</h3>
          <span className="meta-label text-brand-muted">Cognitive Load</span>
        </div>
        
        <CircularProgress
          value={stats.focus}
          max={focusTarget}
          size={160}
          strokeWidth={12}
          color={focusColor}
          backgroundColor={bgColor}
        >
          <div className="flex flex-col items-center">
            <span className="text-4xl font-serif font-black text-brand-text tracking-tighter">
              {formatMinutes(stats.focus)}
            </span>
            <span className="meta-label text-brand-muted mt-1">
              Focused
            </span>
        </div>
        </CircularProgress>

        <div className="grid grid-cols-2 gap-6 w-full mt-8 pt-6 border-t border-brand-surface-2">
          <div className="text-center">
            <div className="meta-label text-brand-muted mb-1">Today</div>
            <div className="text-xl font-bold text-brand-text">{formatMinutes(todayFocus)}</div>
          </div>
          <div className="text-center">
            <div className="meta-label text-brand-muted mb-1">Avg / Day</div>
            <div className="text-xl font-bold text-brand-text">{formatMinutes(avgPerDay)}</div>
          </div>
          <div className="text-center">
            <div className="meta-label text-brand-muted mb-1">Avg / Week</div>
            <div className="text-xl font-bold text-brand-text">{formatMinutes(avgWeek)}</div>
          </div>
          <div className="text-center">
            <div className="meta-label text-brand-muted mb-1">Avg / Month</div>
            <div className="text-xl font-bold text-brand-text">{formatMinutes(avgMonth)}</div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-center gap-3 w-full opacity-30">
        <div className="h-px flex-1 bg-brand-muted/20"></div>
        <p className="text-[10px] font-bold text-brand-muted uppercase tracking-[0.2em]">
          {Math.round((stats.focus / focusTarget) * 100)}% of Target
        </p>
        <div className="h-px flex-1 bg-brand-muted/20"></div>
      </div>
    </div>
  );
}
