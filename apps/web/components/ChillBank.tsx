// components/ChillBank.tsx
"use client";

import { CircularProgress } from "./ui/CircularProgress";
import { cn } from "../lib/utils";

interface ChillBankProps {
  earnedMinutes: number;
  usedMinutes: number;
  targetRatio?: number;
}

export function ChillBank({ earnedMinutes, usedMinutes, targetRatio = 3.0 }: ChillBankProps) {
  const available = earnedMinutes - usedMinutes;
  const percentage = earnedMinutes > 0 ? Math.min(100, (available / earnedMinutes) * 100) : 0;
  
  const progressColor = "#F08A5D"; // Category Reset FG
  const bgColor = "rgba(240,138,93,0.14)"; // Category Reset BG

  return (
    <div className="bg-brand-surface p-8 rounded-[2.5rem] cozy-border shadow-soft hover:shadow-2xl transition-all duration-500 group h-full flex flex-col justify-between">
      <div className="flex flex-col items-center">
        <div className="w-full flex justify-between items-center mb-6">
          <h3 className="card-title text-brand-text italic">Chill Bank</h3>
          <span className="meta-label text-brand-muted">Rest Balance</span>
        </div>
        
        <CircularProgress
          value={available}
          max={earnedMinutes || 1}
          size={160}
          strokeWidth={12}
          color={progressColor}
          backgroundColor={bgColor}
        >
          <div className="flex flex-col items-center">
            <span className="text-4xl font-serif font-black text-brand-text tracking-tighter">
              {Math.floor(available)}m
            </span>
            <span className="meta-label text-brand-muted mt-1">
              Available
            </span>
        </div>
        </CircularProgress>

        <div className="grid grid-cols-2 gap-8 w-full mt-8 pt-6 border-t border-brand-surface-2">
          <div className="text-center">
            <div className="meta-label text-brand-muted mb-1">Earned</div>
            <div className="text-xl font-bold text-brand-text">{Math.floor(earnedMinutes)}m</div>
          </div>
          <div className="text-center">
            <div className="meta-label text-brand-muted mb-1">Used</div>
            <div className="text-xl font-bold text-brand-text">{Math.floor(usedMinutes)}m</div>
          </div>
        </div>
      </div>

      {targetRatio && (
        <div className="mt-6 flex items-center justify-center gap-3 w-full opacity-30">
          <div className="h-px flex-1 bg-brand-muted/20"></div>
          <p className="text-[10px] font-bold text-brand-muted uppercase tracking-[0.2em]">
            1:{targetRatio} Focus Ratio
          </p>
          <div className="h-px flex-1 bg-brand-muted/20"></div>
        </div>
      )}
    </div>
  );
}
