// components/ProductivitySummary.tsx
"use client";

import { CircularProgress } from "./ui/CircularProgress";

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

  const getStats = () => {
    if (range === "day") {
      const today = daily[daily.length - 1];
      return today ? {
        focus: today.focusMinutes,
        chill: today.chillMinutes,
        earned: today.earnedChillMinutes,
        label: "Today's Focus"
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
      <div className="bg-white/70 backdrop-blur-md rounded-3xl border border-slate-100 shadow-xl p-8 transition-all duration-500 h-full flex flex-col justify-center items-center">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-2">
          {range === "day" ? "Today" : "This Week"}
        </h3>
        <p className="text-sm font-medium text-slate-300 italic">Finding your data...</p>
      </div>
    );
  }

  // Define focus target (e.g., 4 hours/day or 20 hours/week)
  const focusTarget = range === "day" ? 240 : 1200;
  const focusColor = "#1A1C2E"; // brand-blue
  const bgColor = "#E0F2FE"; // rainbow-tests (Sky Blue) as a light complement

  return (
    <div className="bg-white/70 backdrop-blur-md rounded-3xl border border-slate-100 shadow-xl p-8 hover:shadow-2xl transition-all duration-500 group">
      <div className="flex flex-col items-center">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">{stats.label}</h3>
        
        <CircularProgress
          value={stats.focus}
          max={focusTarget}
          size={160}
          strokeWidth={12}
          color={focusColor}
          backgroundColor={bgColor}
        >
          <div className="flex flex-col items-center">
            <span className="text-3xl font-black text-slate-800 tracking-tighter">
              {formatMinutes(stats.focus)}
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              Focused
            </span>
          </div>
        </CircularProgress>

        <div className="grid grid-cols-2 gap-8 w-full mt-8 pt-6 border-t border-slate-50">
          <div className="text-center">
            <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Chill Time</div>
            <div className="text-lg font-black text-slate-700">{Math.round(stats.chill)}m</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Earned</div>
            <div className="text-lg font-black text-slate-700">{Math.round(stats.earned)}m</div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-3 w-full opacity-50">
          <span className="h-px flex-1 bg-slate-100"></span>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
            {Math.round((stats.focus / focusTarget) * 100)}% of Target
          </p>
          <span className="h-px flex-1 bg-slate-100"></span>
        </div>
      </div>
    </div>
  );
}
