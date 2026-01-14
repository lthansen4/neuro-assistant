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
      <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-gray-100 shadow-lg p-6 hover:shadow-xl transition-all duration-300">
        <h3 className="text-sm font-bold text-gray-800 mb-2 uppercase tracking-wider">Daily Streak</h3>
        <p className="text-sm text-gray-500 italic">Start your streak today! 🔥</p>
      </div>
    );
  }

  const isActive = streak.lastIncrementedOn
    ? new Date(streak.lastIncrementedOn).toDateString() === new Date().toDateString()
    : false;

  return (
    <div className="bg-white/70 backdrop-blur-md rounded-2xl border border-orange-100 shadow-lg p-6 hover:shadow-xl transition-all duration-300 relative overflow-hidden group">
      {/* Decorative background flare */}
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-orange-100/50 rounded-full blur-3xl group-hover:bg-orange-200/50 transition-colors duration-500"></div>
      
      <div className="flex items-center justify-between mb-4 relative z-10">
        <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider text-orange-700 flex items-center gap-2">
          Daily Streak {isActive && <span className="animate-bounce">🔥</span>}
        </h3>
        {isActive && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-orange-500 text-white shadow-sm ring-4 ring-orange-50">
            Current
          </span>
        )}
      </div>
      
      <div className="flex items-center gap-8 relative z-10">
        <div className="text-center group-hover:scale-110 transition-transform duration-300">
          <div className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-br from-orange-500 to-red-600 tracking-tighter">
            {streak.currentCount}
          </div>
          <div className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mt-1">Days</div>
        </div>
        
        <div className="h-10 w-px bg-gray-100"></div>
        
        <div className="text-center">
          <div className="text-xl font-bold text-gray-400 tracking-tight">
            {streak.longestCount}
          </div>
          <div className="text-[10px] font-bold text-gray-300 uppercase tracking-widest mt-1">Best</div>
        </div>
      </div>
    </div>
  );
}




