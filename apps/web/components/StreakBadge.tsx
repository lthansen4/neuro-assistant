// components/StreakBadge.tsx
"use client";

interface Streak {
  currentCount: number; // Renamed from currentStreakDays
  longestCount: number; // Renamed from longestStreakDays
  lastIncrementedOn: string | null; // Renamed from lastActiveDate
}

interface StreakBadgeProps {
  streak: Streak | null;
}

export function StreakBadge({ streak }: StreakBadgeProps) {
  if (!streak) {
    return (
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Streak</h3>
        <p className="text-sm text-gray-500">Start your streak today!</p>
      </div>
    );
  }

  const isActive = streak.lastIncrementedOn
    ? new Date(streak.lastIncrementedOn).toDateString() === new Date().toDateString()
    : false;

  return (
    <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-lg border border-orange-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Streak</h3>
      <div className="flex items-center gap-4">
        <div className="text-center">
          <div className="text-3xl font-bold text-orange-600">
            {streak.currentCount}
          </div>
          <div className="text-xs text-gray-600">Current</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-semibold text-gray-700">
            {streak.longestCount}
          </div>
          <div className="text-xs text-gray-600">Best</div>
        </div>
        {isActive && (
          <div className="ml-auto">
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              🔥 Active
            </span>
          </div>
        )}
      </div>
    </div>
  );
}




