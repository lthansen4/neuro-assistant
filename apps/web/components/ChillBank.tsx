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
    <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-100 shadow-lg p-6 hover:shadow-xl transition-all duration-300">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider text-purple-700">Chill Bank</h3>
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-50 text-purple-700 text-xs font-bold shadow-sm border border-purple-100">
          <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
          {Math.floor(available)}m available
        </div>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-4 mb-4 overflow-hidden p-1 shadow-inner">
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-out shadow-sm ${
            isLow 
              ? "bg-gradient-to-r from-rose-500 to-red-600" 
              : percentage < 50 
                ? "bg-gradient-to-r from-amber-400 to-orange-500" 
                : "bg-gradient-to-r from-emerald-400 to-teal-500"
          }`}
          style={{ width: `${Math.max(5, percentage)}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-50/50 p-2 rounded-xl text-center border border-gray-100">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-tighter mb-0.5">Earned</div>
          <div className="text-sm font-bold text-gray-700">{Math.floor(earnedMinutes)}m</div>
        </div>
        <div className="bg-gray-50/50 p-2 rounded-xl text-center border border-gray-100">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-tighter mb-0.5">Used</div>
          <div className="text-sm font-bold text-gray-700">{Math.floor(usedMinutes)}m</div>
        </div>
      </div>
      {targetRatio && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <span className="h-px flex-1 bg-gray-100"></span>
          <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">
            1:{targetRatio} Focus Ratio
          </p>
          <span className="h-px flex-1 bg-gray-100"></span>
        </div>
      )}
    </div>
  );
}




