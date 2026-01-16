// components/ChillBank.tsx
"use client";

import { useTimer } from "../context/TimerContext";
import { CircularProgress } from "./ui/CircularProgress";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import { toast } from "./ui/Toast";
import { useEffect } from "react";

interface ChillBankProps {
  userId: string;
  earnedMinutes: number;
  usedMinutes: number;
  targetRatio?: number;
  onSessionLogged?: () => void;
}

export function ChillBank({
  userId,
  earnedMinutes,
  usedMinutes,
  targetRatio = 3.0,
  onSessionLogged,
}: ChillBankProps) {
  const {
    focusRunning,
    focusMinutes,
    focusElapsedSec,
    chillRunning,
    chillRemainingSec,
    chillRemainingMinutes,
    startFocus,
    stopFocus,
    startChill,
    stopChill,
    formatClock
  } = useTimer();

  const available = earnedMinutes - usedMinutes;
  
  const progressColor = "#F08A5D"; 
  const bgColor = "rgba(240,138,93,0.14)"; 
  const focusColor = "#6D5EF7";

  // Handle auto-complete for chill
  useEffect(() => {
    if (chillRunning && chillRemainingSec <= 0) {
      stopChill(userId, true).then(() => onSessionLogged?.());
    }
  }, [chillRunning, chillRemainingSec, userId, onSessionLogged, stopChill]);

  return (
    <div className="bg-brand-surface p-10 rounded-[2.5rem] cozy-border shadow-soft hover:shadow-2xl transition-all duration-500 group flex flex-col justify-between h-full">
      <div className="flex flex-col items-center">
        <div className="w-full flex justify-between items-center mb-6">
          <h3 className="card-title text-brand-text italic">Chill Bank</h3>
          <span className="meta-label text-brand-muted">Rest Balance</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 w-full">
          {/* Focus Timer */}
          <div className="flex flex-col items-center gap-5">
            <CircularProgress
              value={focusElapsedSec % 60}
              max={60}
              size={160}
              strokeWidth={10}
              color={`${focusColor}AA`}
              backgroundColor="rgba(109,94,247,0.12)"
            >
              <div className="flex flex-col items-center">
                <span className="text-3xl font-serif font-black text-brand-text tracking-tighter">
                  {focusRunning ? `${focusMinutes}m` : "0m"}
                </span>
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-muted mt-2">
                  Focus
                </span>
              </div>
            </CircularProgress>
            <Button
              onClick={focusRunning ? () => stopFocus(userId).then(() => onSessionLogged?.()) : () => startFocus()}
              className={cn(
                "rounded-full px-8 py-3 text-[11px] font-black uppercase tracking-[0.2em] shadow-soft hover:brightness-110 transition-all",
                focusRunning ? "bg-brand-rose text-white" : "bg-brand-primary text-white"
              )}
            >
              {focusRunning ? "Stop" : "Lock In"}
            </Button>
          </div>

          {/* Chill Timer */}
          <div className="flex flex-col items-center gap-5">
            <CircularProgress
              value={chillRunning ? chillRemainingSec : Math.max(0, Math.floor(available) * 60)}
              max={chillRunning ? Math.max(1, (chillRemainingSec + (new Date().getTime() - (useTimer().chillStart ? new Date(useTimer().chillStart!).getTime() : 0))/1000)) : Math.max(1, Math.floor(available) * 60)}
              size={160}
              strokeWidth={10}
              color="rgba(240,138,93,0.75)"
              backgroundColor={bgColor}
            >
              <div className="flex flex-col items-center">
                <span className="text-3xl font-serif font-black text-brand-text tracking-tighter">
                  {chillRunning ? formatClock(chillRemainingSec) : `${Math.floor(available)}m`}
                </span>
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-muted mt-2">
                  Chill
                </span>
              </div>
            </CircularProgress>
            <Button
              onClick={chillRunning ? () => stopChill(userId, false).then(() => onSessionLogged?.()) : () => startChill(available)}
              className={cn(
                "rounded-full px-8 py-3 text-[11px] font-black uppercase tracking-[0.2em] shadow-soft hover:brightness-105 transition-all",
                chillRunning ? "bg-brand-rose text-white" : "bg-brand-surface-2 text-brand-text"
              )}
              disabled={!chillRunning && Math.floor(available) <= 0}
            >
              {chillRunning ? "Stop" : "Redeem"}
            </Button>
          </div>
        </div>

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
