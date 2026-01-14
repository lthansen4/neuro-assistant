// components/ProductivitySummary.tsx
"use client";

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
    const mins = minutes % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  if (range === "day") {
    const today = daily[daily.length - 1];
    if (!today) {
      return (
        <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-100 shadow-lg p-6">
          <h3 className="text-sm font-bold text-gray-800 mb-2 uppercase tracking-wider">Today</h3>
          <p className="text-sm text-gray-500">No activity today</p>
        </div>
      );
    }

    return (
      <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-100 shadow-lg p-6 hover:shadow-xl transition-all duration-300">
        <h3 className="text-sm font-bold text-gray-800 mb-4 uppercase tracking-wider">Today's Focus</h3>
        <div className="grid grid-cols-3 gap-6">
          <div className="space-y-1">
            <div className="text-2xl font-black text-indigo-600 tracking-tight">
              {formatMinutes(today.focusMinutes)}
            </div>
            <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Focus</div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-black text-purple-600 tracking-tight">
              {formatMinutes(today.chillMinutes)}
            </div>
            <div className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Chill</div>
          </div>
          <div className="space-y-1">
            <div className="text-2xl font-black text-emerald-600 tracking-tight">
              {formatMinutes(today.earnedChillMinutes)}
            </div>
            <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Earned</div>
          </div>
        </div>
      </div>
    );
  }

  // Week view
  if (!weekly) {
    return (
      <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-100 shadow-lg p-6">
        <h3 className="text-sm font-bold text-gray-800 mb-2 uppercase tracking-wider">This Week</h3>
        <p className="text-sm text-gray-500">No activity this week</p>
      </div>
    );
  }

  return (
    <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-100 shadow-lg p-6 hover:shadow-xl transition-all duration-300">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Weekly Stats</h3>
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter bg-gray-50 px-2 py-1 rounded">
          {new Date(weekly.startDate).toLocaleDateString("en-US", { month: 'short', day: 'numeric' })} - {new Date(weekly.endDate).toLocaleDateString("en-US", { month: 'short', day: 'numeric' })}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-6 mb-2">
        <div className="space-y-1">
          <div className="text-2xl font-black text-indigo-600 tracking-tight">
            {formatMinutes(weekly.focusMinutes)}
          </div>
          <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Focus</div>
        </div>
        <div className="space-y-1">
          <div className="text-2xl font-black text-purple-600 tracking-tight">
            {formatMinutes(weekly.chillMinutes)}
          </div>
          <div className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Chill</div>
        </div>
        <div className="space-y-1">
          <div className="text-2xl font-black text-emerald-600 tracking-tight">
            {formatMinutes(weekly.earnedChillMinutes)}
          </div>
          <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Earned</div>
        </div>
      </div>
    </div>
  );
}




