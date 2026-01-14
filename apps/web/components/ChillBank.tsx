// components/ChillBank.tsx
"use client";

interface ChillBankProps {
  earnedMinutes: number;
  usedMinutes: number;
  targetRatio?: number;
}

export function ChillBank({ earnedMinutes, usedMinutes, targetRatio = 2.5 }: ChillBankProps) {
  const available = earnedMinutes - usedMinutes;
  const percentage = earnedMinutes > 0 ? Math.min(100, (available / earnedMinutes) * 100) : 0;
  const isLow = percentage < 20;

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-700">Chill Bank</h3>
        <span className="text-xs text-gray-500">
          {Math.floor(available)} min available
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
        <div
          className={`h-3 rounded-full transition-all ${
            isLow ? "bg-red-500" : percentage < 50 ? "bg-yellow-500" : "bg-green-500"
          }`}
          style={{ width: `${Math.max(0, percentage)}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-600">
        <span>Earned: {Math.floor(earnedMinutes)} min</span>
        <span>Used: {Math.floor(usedMinutes)} min</span>
      </div>
      {targetRatio && (
        <p className="text-xs text-gray-500 mt-1">
          Ratio: 1 min chill per {targetRatio} min focus
        </p>
      )}
    </div>
  );
}




