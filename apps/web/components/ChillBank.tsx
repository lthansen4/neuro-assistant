// components/ChillBank.tsx
"use client";

import { CircularProgress } from "./ui/CircularProgress";

interface ChillBankProps {
  earnedMinutes: number;
  usedMinutes: number;
  targetRatio?: number;
}

export function ChillBank({ earnedMinutes, usedMinutes, targetRatio = 3.0 }: ChillBankProps) {
  const available = earnedMinutes - usedMinutes;
  const percentage = earnedMinutes > 0 ? Math.min(100, (available / earnedMinutes) * 100) : 0;
  
  // Use theme colors
  const progressColor = "#006747"; // brand-green
  const bgColor = "#F3E8FF"; // rainbow-chill (Soft Lavender)

  return (
    <div className="bg-white/70 backdrop-blur-md rounded-3xl border border-slate-100 shadow-xl p-8 hover:shadow-2xl transition-all duration-500 group">
      <div className="flex flex-col items-center">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Chill Bank</h3>
        
        <CircularProgress
          value={available}
          max={earnedMinutes || 1}
          size={160}
          strokeWidth={12}
          color={progressColor}
          backgroundColor={bgColor}
        >
          <div className="flex flex-col items-center">
            <span className="text-3xl font-black text-slate-800 tracking-tighter">
              {Math.floor(available)}m
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              Available
            </span>
        </div>
        </CircularProgress>

        <div className="grid grid-cols-2 gap-8 w-full mt-8 pt-6 border-t border-slate-50">
          <div className="text-center">
            <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Earned</div>
            <div className="text-lg font-black text-slate-700">{Math.floor(earnedMinutes)}m</div>
      </div>
          <div className="text-center">
            <div className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1">Used</div>
            <div className="text-lg font-black text-slate-700">{Math.floor(usedMinutes)}m</div>
      </div>
        </div>

      {targetRatio && (
          <div className="mt-6 flex items-center justify-center gap-3 w-full opacity-50">
            <span className="h-px flex-1 bg-slate-100"></span>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">
            1:{targetRatio} Focus Ratio
          </p>
            <span className="h-px flex-1 bg-slate-100"></span>
        </div>
      )}
      </div>
    </div>
  );
}
