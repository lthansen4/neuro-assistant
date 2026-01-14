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
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Today</h3>
          <p className="text-sm text-gray-500">No activity today</p>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Today</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-2xl font-bold text-blue-600">
              {formatMinutes(today.focusMinutes)}
            </div>
            <div className="text-xs text-gray-600">Focus</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-purple-600">
              {formatMinutes(today.chillMinutes)}
            </div>
            <div className="text-xs text-gray-600">Chill</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">
              {formatMinutes(today.earnedChillMinutes)}
            </div>
            <div className="text-xs text-gray-600">Earned</div>
          </div>
        </div>
      </div>
    );
  }

  // Week view
  if (!weekly) {
    return (
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">This Week</h3>
        <p className="text-sm text-gray-500">No activity this week</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">This Week</h3>
      <div className="grid grid-cols-3 gap-4 mb-3">
        <div>
          <div className="text-2xl font-bold text-blue-600">
            {formatMinutes(weekly.focusMinutes)}
          </div>
          <div className="text-xs text-gray-600">Focus</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-purple-600">
            {formatMinutes(weekly.chillMinutes)}
          </div>
          <div className="text-xs text-gray-600">Chill</div>
        </div>
        <div>
          <div className="text-2xl font-bold text-green-600">
            {formatMinutes(weekly.earnedChillMinutes)}
          </div>
          <div className="text-xs text-gray-600">Earned</div>
        </div>
      </div>
      <div className="text-xs text-gray-500">
        {new Date(weekly.startDate).toLocaleDateString()} -{" "}
        {new Date(weekly.endDate).toLocaleDateString()}
      </div>
    </div>
  );
}




