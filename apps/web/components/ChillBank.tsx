// components/ChillBank.tsx
"use client";

import { useTimer } from "../context/TimerContext";
import { CircularProgress } from "./ui/CircularProgress";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import { toast } from "./ui/Toast";
import { useEffect } from "react";
import { Calendar } from "lucide-react";

interface ChillBankProps {
  userId: string;
  earnedMinutes: number;
  usedMinutes: number;
  targetRatio?: number;
  onSessionLogged?: () => void;
  onLockIn?: () => void;
}

export function ChillBank({
  userId,
  earnedMinutes,
  usedMinutes,
  targetRatio = 3.0,
  onSessionLogged,
  onLockIn,
}: ChillBankProps) {
  const {
    focusRunning,
    focusMinutes,
    focusElapsedSec,
    chillRunning,
    chillRemainingSec,
    chillRemainingMinutes,
    usingBufferTime,
    startFocus,
    stopFocus,
    startChill,
    stopChill,
    formatClock,
    suggestedDuration,
    suggestedAssignment,
    bufferAvailable,
    earnedChillAvailable,
    loadTimerContext,
  } = useTimer();

  // Load timer context on mount and after sessions
  useEffect(() => {
    loadTimerContext(userId);
  }, [userId, loadTimerContext]);

  const available = earnedMinutes - usedMinutes;
  const totalAvailable = bufferAvailable + earnedChillAvailable;
  
  const progressColor = "#F08A5D"; 
  const bgColor = "rgba(240,138,93,0.14)"; 
  const focusColor = "#6D5EF7";
  // NEW: Buffer color (gold/amber) vs earned chill (teal)
  const bufferColor = "#F59E0B"; // Amber
  const earnedChillColor = "#14B8A6"; // Teal

  // Handle auto-complete for chill
  useEffect(() => {
    if (chillRunning && chillRemainingSec <= 0) {
      stopChill(userId, true).then(() => onSessionLogged?.());
    }
  }, [chillRunning, chillRemainingSec, userId, onSessionLogged, stopChill]);

  const handleLockIn = async () => {
    if (onLockIn) {
      onLockIn();
    } else {
      // Use suggested assignment if available
      if (suggestedAssignment) {
        startFocus(suggestedAssignment.id, suggestedAssignment.title);
      } else {
        startFocus();
      }
    }
  };

  const handleStartChill = () => {
    startChill(totalAvailable, bufferAvailable);
  };

  // Determine current chill timer color based on what's being used
  const currentChillColor = usingBufferTime ? bufferColor : earnedChillColor;
  const currentChillBgColor = usingBufferTime ? "rgba(245,158,11,0.14)" : "rgba(20,184,166,0.14)";

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
            
            <div className="flex flex-col items-center gap-2 w-full">
              {suggestedDuration && !focusRunning && (
                <div className="flex items-center gap-2 text-[10px] text-brand-primary font-bold uppercase tracking-wider bg-brand-primary/10 px-3 py-1 rounded-full">
                  <Calendar size={12} />
                  <span>Next: {suggestedDuration}m</span>
                </div>
              )}
              {suggestedAssignment && !focusRunning && (
                <div className="text-[10px] text-brand-muted text-center font-medium max-w-[160px] truncate">
                  {suggestedAssignment.title}
                </div>
              )}
              <Button
                onClick={focusRunning ? () => stopFocus(userId).then(() => onSessionLogged?.()) : handleLockIn}
                className={cn(
                  "rounded-full px-8 py-3 text-[11px] font-black uppercase tracking-[0.2em] shadow-soft hover:brightness-110 transition-all w-full",
                  focusRunning ? "bg-brand-rose text-white" : "bg-brand-primary text-white"
                )}
              >
                {focusRunning ? "Stop" : suggestedDuration ? `Lock In ${suggestedDuration}m` : "Lock In"}
              </Button>
            </div>
          </div>

          {/* Chill Timer */}
          <div className="flex flex-col items-center gap-5">
            <CircularProgress
              value={chillRunning ? chillRemainingSec : Math.max(0, Math.floor(totalAvailable) * 60)}
              max={chillRunning ? Math.max(1, (chillRemainingSec + (new Date().getTime() - (useTimer().chillStart ? new Date(useTimer().chillStart!).getTime() : 0))/1000)) : Math.max(1, Math.floor(totalAvailable) * 60)}
              size={160}
              strokeWidth={10}
              color={chillRunning ? currentChillColor : progressColor}
              backgroundColor={chillRunning ? currentChillBgColor : bgColor}
            >
              <div className="flex flex-col items-center">
                <span className="text-3xl font-serif font-black text-brand-text tracking-tighter">
                  {chillRunning ? formatClock(chillRemainingSec) : `${Math.floor(totalAvailable)}m`}
                </span>
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-brand-muted mt-2">
                  Chill
                </span>
                {chillRunning && (
                  <span className="text-[8px] font-bold uppercase tracking-wider mt-1" style={{ color: currentChillColor }}>
                    {usingBufferTime ? "Buffer (expires tonight)" : "Earned"}
                  </span>
                )}
              </div>
            </CircularProgress>
            <Button
              onClick={chillRunning ? () => stopChill(userId, false).then(() => onSessionLogged?.()) : handleStartChill}
              className={cn(
                "rounded-full px-8 py-3 text-[11px] font-black uppercase tracking-[0.2em] shadow-soft hover:brightness-105 transition-all",
                chillRunning ? "bg-brand-rose text-white" : "bg-brand-surface-2 text-brand-text"
              )}
              disabled={!chillRunning && Math.floor(totalAvailable) <= 0}
            >
              {chillRunning ? "Stop" : "Redeem"}
            </Button>
          </div>
        </div>

        {/* Balance breakdown with buffer time */}
        <div className="grid grid-cols-3 gap-6 w-full mt-8 pt-6 border-t border-brand-surface-2">
          <div className="text-center">
            <div className="meta-label text-brand-muted mb-1">Buffer</div>
            <div className="text-xl font-bold" style={{ color: bufferColor }}>{Math.floor(bufferAvailable)}m</div>
            <div className="text-[8px] text-brand-muted uppercase tracking-wider mt-0.5">Expires Tonight</div>
          </div>
          <div className="text-center">
            <div className="meta-label text-brand-muted mb-1">Earned</div>
            <div className="text-xl font-bold" style={{ color: earnedChillColor }}>{Math.floor(earnedChillAvailable)}m</div>
            <div className="text-[8px] text-brand-muted uppercase tracking-wider mt-0.5">Permanent</div>
          </div>
          <div className="text-center">
            <div className="meta-label text-brand-muted mb-1">Total</div>
            <div className="text-xl font-bold text-brand-text">{Math.floor(totalAvailable)}m</div>
            <div className="text-[8px] text-brand-muted uppercase tracking-wider mt-0.5">Available</div>
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
