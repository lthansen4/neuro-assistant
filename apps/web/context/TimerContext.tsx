"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { createSession, fetchTimerContext } from "../lib/api";
import { toast } from "../components/ui/Toast";

interface TimerContextType {
  focusRunning: boolean;
  focusStart: string | null;
  focusMinutes: number;
  focusElapsedSec: number;
  
  chillRunning: boolean;
  chillStart: string | null;
  chillDurationSec: number;
  chillRemainingSec: number;
  chillRemainingMinutes: number;
  usingBufferTime: boolean; // NEW: Track if using buffer vs earned chill
  
  startFocus: (assignmentId?: string | null, assignmentTitle?: string | null) => void;
  stopFocus: (userId: string) => Promise<void>;
  
  startChill: (availableMinutes: number, bufferMinutes: number) => void;
  stopChill: (userId: string, autoComplete?: boolean) => Promise<void>;
  
  formatClock: (seconds: number) => string;
  activeTimer: "focus" | "chill" | null;
  
  // NEW: Timer context suggestions
  suggestedDuration: number | null;
  suggestedAssignment: { id: string; title: string } | null;
  bufferAvailable: number;
  earnedChillAvailable: number;
  loadTimerContext: (userId: string) => Promise<void>;
}

const TimerContext = createContext<TimerContextType | undefined>(undefined);

const focusStorageKey = "gesso_focus_timer";
const chillStorageKey = "gesso_chill_timer";

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [now, setNow] = useState(new Date());
  
  const [focusStart, setFocusStart] = useState<string | null>(null);
  const [focusRunning, setFocusRunning] = useState(false);
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const [assignmentTitle, setAssignmentTitle] = useState<string | null>(null);
  
  const [chillStart, setChillStart] = useState<string | null>(null);
  const [chillDurationSec, setChillDurationSec] = useState(0);
  const [chillRunning, setChillRunning] = useState(false);
  const [chillBufferSeconds, setChillBufferSeconds] = useState(0); // NEW: Track how much of buffer we're using
  
  // NEW: Timer context state
  const [suggestedDuration, setSuggestedDuration] = useState<number | null>(null);
  const [suggestedAssignment, setSuggestedAssignment] = useState<{ id: string; title: string } | null>(null);
  const [bufferAvailable, setBufferAvailable] = useState(0);
  const [earnedChillAvailable, setEarnedChillAvailable] = useState(0);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load from storage
  useEffect(() => {
    try {
      const storedFocus = localStorage.getItem(focusStorageKey);
      if (storedFocus) {
        const data = JSON.parse(storedFocus);
        setFocusStart(data.startTime);
        setFocusRunning(data.isRunning);
        setAssignmentId(data.assignmentId || null);
        setAssignmentTitle(data.assignmentTitle || null);
      }
      const storedChill = localStorage.getItem(chillStorageKey);
      if (storedChill) {
        const data = JSON.parse(storedChill);
        setChillStart(data.startTime);
        setChillDurationSec(data.durationSec || 0);
        setChillRunning(data.isRunning);
        setChillBufferSeconds(data.bufferSeconds || 0);
      }
    } catch {
      // ignore
    }
  }, []);

  // Save to storage
  useEffect(() => {
    localStorage.setItem(
      focusStorageKey,
      JSON.stringify({ 
        startTime: focusStart, 
        isRunning: focusRunning,
        assignmentId,
        assignmentTitle
      })
    );
  }, [focusStart, focusRunning, assignmentId, assignmentTitle]);

  useEffect(() => {
    localStorage.setItem(
      chillStorageKey,
      JSON.stringify({ 
        startTime: chillStart, 
        durationSec: chillDurationSec, 
        isRunning: chillRunning,
        bufferSeconds: chillBufferSeconds
      })
    );
  }, [chillStart, chillDurationSec, chillRunning, chillBufferSeconds]);

  // Derived Focus values
  const focusElapsedSec = focusRunning && focusStart ? Math.max(0, Math.floor((now.getTime() - new Date(focusStart).getTime()) / 1000)) : 0;
  const focusMinutes = Math.max(1, Math.round(focusElapsedSec / 60));

  // Derived Chill values
  const chillElapsedSec = chillRunning && chillStart ? Math.max(0, Math.floor((now.getTime() - new Date(chillStart).getTime()) / 1000)) : 0;
  const chillRemainingSec = Math.max(0, chillDurationSec - chillElapsedSec);
  const chillRemainingMinutes = Math.max(0, Math.ceil(chillRemainingSec / 60));
  
  // NEW: Are we using buffer time? (If we started with any buffer seconds, we're using it first)
  const usingBufferTime = chillRunning && chillBufferSeconds > 0 && chillElapsedSec < chillBufferSeconds;

  const activeTimer = focusRunning ? "focus" : chillRunning ? "chill" : null;

  const formatClock = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // NEW: Load timer context from API
  const loadTimerContext = useCallback(async (userId: string) => {
    try {
      const data = await fetchTimerContext(userId);
      if (data.ok) {
        setSuggestedDuration(data.nextFocusBlock?.suggestedDuration || null);
        setSuggestedAssignment(data.assignmentInfo || null);
        setBufferAvailable(data.bufferTime?.available || 0);
        setEarnedChillAvailable(data.earnedChillTime?.available || 0);
      }
    } catch (error) {
      console.error("[TimerContext] Failed to load timer context:", error);
    }
  }, []);

  const startFocus = useCallback((id?: string | null, title?: string | null) => {
    if (chillRunning) {
      toast.error("Finish your chill session first!");
      return;
    }
    setFocusStart(new Date().toISOString());
    setFocusRunning(true);
    setAssignmentId(id || null);
    setAssignmentTitle(title || null);
  }, [chillRunning]);

  const stopFocus = useCallback(async (userId: string) => {
    if (!focusStart) return;
    const finalMinutes = Math.round((new Date().getTime() - new Date(focusStart).getTime()) / 60000);
    
    try {
      const response = await createSession(userId, {
        type: "Focus",
        startTime: focusStart,
        endTime: new Date().toISOString(),
        assignmentId: assignmentId || null,
      });
      
      // Update buffer balance if returned
      if (response.bufferBalance) {
        setBufferAvailable(response.bufferBalance.available);
      }
      
      toast.success(`Focus logged! ${finalMinutes}m earned 🔥`);
      setFocusRunning(false);
      setFocusStart(null);
      setAssignmentId(null);
      setAssignmentTitle(null);
      
      // Reload timer context to get updated balances
      await loadTimerContext(userId);
    } catch (e: any) {
      toast.error(e.message || "Failed to log focus session");
      throw e;
    }
  }, [focusStart, assignmentId, loadTimerContext]);

  const startChill = useCallback((availableMinutes: number, bufferMinutes: number) => {
    if (focusRunning) {
      toast.error("Stop focusing before you chill!");
      return;
    }
    if (availableMinutes <= 0) {
      toast.error("No chill minutes available.");
      return;
    }
    setChillStart(new Date().toISOString());
    setChillDurationSec(availableMinutes * 60);
    setChillBufferSeconds(bufferMinutes * 60); // Track buffer portion
    setChillRunning(true);
  }, [focusRunning]);

  const stopChill = useCallback(async (userId: string, autoComplete = false) => {
    if (!chillStart) return;
    const endTime = autoComplete
      ? new Date(new Date(chillStart).getTime() + chillDurationSec * 1000).toISOString()
      : new Date().toISOString();
    const minutes = Math.round((new Date(endTime).getTime() - new Date(chillStart).getTime()) / 60000);
    
    try {
      await createSession(userId, {
        type: "Chill",
        startTime: chillStart,
        endTime,
      });
      toast.success(`Chill session logged! ${minutes}m redeemed 🌊`);
      setChillRunning(false);
      setChillStart(null);
      setChillDurationSec(0);
      setChillBufferSeconds(0);
      
      // Reload timer context to get updated balances
      await loadTimerContext(userId);
    } catch (e: any) {
      toast.error(e.message || "Failed to log chill session");
      throw e;
    }
  }, [chillStart, chillDurationSec, loadTimerContext]);

  return (
    <TimerContext.Provider value={{
      focusRunning, focusStart, focusMinutes, focusElapsedSec,
      chillRunning, chillStart, chillDurationSec, chillRemainingSec, chillRemainingMinutes,
      usingBufferTime,
      startFocus, stopFocus,
      startChill, stopChill,
      formatClock,
      activeTimer,
      suggestedDuration,
      suggestedAssignment,
      bufferAvailable,
      earnedChillAvailable,
      loadTimerContext,
    }}>
      {children}
    </TimerContext.Provider>
  );
}

export function useTimer() {
  const context = useContext(TimerContext);
  if (context === undefined) {
    throw new Error("useTimer must be used within a TimerProvider");
  }
  return context;
}

