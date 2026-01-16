"use client";

import { useTimer } from "../context/TimerContext";
import { useUser } from "@clerk/nextjs";
import { cn } from "../lib/utils";
import { GessoIcon } from "./ui/GessoIcon";
import { X, Play, Square } from "lucide-react";

export function GlobalTimerIndicator() {
  const { user } = useUser();
  const { 
    activeTimer, 
    focusMinutes, 
    chillRemainingSec, 
    formatClock, 
    stopFocus, 
    stopChill 
  } = useTimer();

  if (!activeTimer || !user) return null;

  const handleStop = () => {
    if (activeTimer === "focus") {
      stopFocus(user.id);
    } else {
      stopChill(user.id);
    }
  };

  return (
    <div className="fixed bottom-24 right-6 md:bottom-12 md:right-12 z-[100] animate-slide-up">
      <div className={cn(
        "flex items-center gap-4 px-6 py-4 rounded-[2rem] shadow-aura-violet border-2 backdrop-blur-xl transition-all duration-500 group",
        activeTimer === "focus" 
          ? "bg-brand-primary/95 border-brand-primary/20 text-white" 
          : "bg-brand-surface-2/95 border-brand-amber/20 text-brand-text"
      )}>
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center animate-pulse-soft",
          activeTimer === "focus" ? "bg-white/20" : "bg-brand-amber/20"
        )}>
          <GessoIcon 
            type={activeTimer === "focus" ? "bolt" : "wave"} 
            size={20} 
            className={activeTimer === "focus" ? "text-white" : "text-brand-amber"}
          />
        </div>

        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">
            {activeTimer === "focus" ? "Locking In" : "Chilling"}
          </span>
          <span className="text-xl font-serif font-black tracking-tight leading-none">
            {activeTimer === "focus" ? `${focusMinutes}m` : formatClock(chillRemainingSec)}
          </span>
        </div>

        <button
          onClick={handleStop}
          className={cn(
            "ml-2 w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90 shadow-soft",
            activeTimer === "focus" 
              ? "bg-white text-brand-primary hover:bg-white/90" 
              : "bg-brand-primary text-white hover:brightness-110"
          )}
        >
          <Square size={16} fill="currentColor" />
        </button>
      </div>
    </div>
  );
}

