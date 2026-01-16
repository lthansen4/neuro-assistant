// components/GradeForecast.tsx
"use client";

import { cn } from "../lib/utils";

interface Forecast {
  courseId: string;
  courseName: string | null;
  currentScore: string | null;
  projectedScore: string | null;
  updatedAt: string | null;
}

interface GradeForecastProps {
  forecasts: Forecast[];
}

export function GradeForecast({ forecasts }: GradeForecastProps) {
  if (forecasts.length === 0) {
    return (
      <div className="bg-brand-surface p-8 rounded-[2.5rem] cozy-border shadow-soft flex flex-col justify-center text-center space-y-2">
        <h3 className="card-title text-brand-text italic">Grade Radar</h3>
        <p className="text-brand-muted font-medium text-sm italic">No forecasts available yet 📉</p>
      </div>
    );
  }

  const formatScore = (score: string | null) => {
    if (!score) return "—";
    const num = parseFloat(score);
    return num.toFixed(1);
  };

  return (
    <div className="bg-brand-surface p-8 rounded-[2.5rem] cozy-border shadow-soft space-y-8">
      <div className="flex items-center justify-between">
        <h3 className="card-title text-brand-text italic">Grade Radar</h3>
        <span className="meta-label text-brand-muted">Projected</span>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {forecasts.map((f) => {
          const projected = parseFloat(f.projectedScore || "0");
          const current = parseFloat(f.currentScore || "0");
          const isImproving = projected > current;

          return (
            <div key={f.courseId} className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-brand-text truncate mr-2">{f.courseName || "Unknown Course"}</span>
                {isImproving && (
                  <span className="text-[10px] font-black text-brand-mint bg-brand-mint/10 px-2 py-0.5 rounded-md uppercase tracking-tighter border border-brand-mint/20">
                    ↑ Improving
                  </span>
                )}
              </div>
              
              <div className="flex items-end justify-between">
                <div className="space-y-0.5">
                  <div className="meta-label text-brand-muted text-[10px]">Current</div>
                  <div className="text-lg font-bold text-brand-text">{formatScore(f.currentScore)}%</div>
                </div>
                
                <div className="text-right space-y-0.5">
                  <div className="meta-label text-brand-primary text-[10px]">Projected</div>
                  <div className={cn(
                    "text-3xl font-serif font-black tracking-tighter",
                    projected >= 90 ? "text-brand-mint" : projected >= 80 ? "text-brand-primary" : "text-brand-amber"
                  )}>
                    {formatScore(f.projectedScore)}%
                  </div>
                </div>
              </div>

              <div className="w-full bg-brand-surface-2 rounded-full h-1.5 overflow-hidden">
                <div 
                  className={cn(
                    "h-full transition-all duration-1000 ease-out",
                    projected >= 90 ? "bg-brand-mint" : "bg-brand-primary"
                  )}
                  style={{ width: `${projected}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
