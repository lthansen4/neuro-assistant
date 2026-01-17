"use client";

import { useState, useEffect, useCallback } from "react";
import { FocusTimerModal } from "./FocusTimerModal";
import confetti from "canvas-confetti";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "https://gessoapi-production.up.railway.app";

// ============================================================================
// TYPES
// ============================================================================

interface ChecklistItem {
  id: string;
  text: string;
  isCompleted: boolean;
  durationMinutes: number;
}

interface PriorityAssignment {
  id: string;
  title: string;
  courseName: string | null;
  dueDate: string | null;
  dueDescription: string;
  hoursUntilDue: number | null;
  priorityScore: number;
  effortEstimateMinutes: number | null;
  isStuck: boolean;
  deferralCount: number;
  hasChecklist: boolean;
  checklistItems: ChecklistItem[];
}

interface RescueModeProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

// ============================================================================
// ICONS
// ============================================================================

const LifebuoyIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 16a4 4 0 100-8 4 4 0 000 8z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M14.83 9.17l4.24-4.24M4.93 19.07l4.24-4.24" />
  </svg>
);

const ClockIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const PlayIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const XIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

// ============================================================================
// ENCOURAGEMENT MESSAGES
// ============================================================================

const ENCOURAGEMENT = {
  starting: [
    "You've got this. Just this one thing.",
    "One step at a time. You can do this.",
    "The hardest part is starting. You're already here.",
    "Focus on progress, not perfection.",
  ],
  completion: [
    "Amazing work! You did it! 🎉",
    "Look at you go! One down! 💪",
    "That's what I'm talking about! ✨",
    "Incredible! You're on fire! 🔥",
  ],
  allDone: [
    "You're all caught up! Time to celebrate! 🎊",
    "Nothing left! You're a productivity machine! 🚀",
    "All done! Go treat yourself! 🍦",
  ]
};

function getRandomMessage(messages: string[]): string {
  return messages[Math.floor(Math.random() * messages.length)];
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function RescueMode({ userId, isOpen, onClose, onComplete }: RescueModeProps) {
  const [assignment, setAssignment] = useState<PriorityAssignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTimer, setShowTimer] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationMessage, setCelebrationMessage] = useState("");
  const [remainingCount, setRemainingCount] = useState(0);

  // Fetch the priority assignment
  const fetchPriority = useCallback(async () => {
    if (!userId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const res = await fetch(`${API_BASE}/api/rescue/priority`, {
        headers: {
          "x-clerk-user-id": userId,
        },
      });

      if (!res.ok) {
        throw new Error("Failed to fetch priority");
      }

      const data = await res.json();
      
      if (data.ok) {
        setAssignment(data.assignment);
        setRemainingCount(data.remainingCount || 0);
      } else {
        setError(data.error || "Something went wrong");
      }
    } catch (e: any) {
      console.error("[RescueMode] Error:", e);
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (isOpen) {
      fetchPriority();
    }
  }, [isOpen, fetchPriority]);

  // Handle marking assignment complete
  const handleComplete = async () => {
    if (!assignment) return;
    
    setCompleting(true);
    
    try {
      const res = await fetch(`${API_BASE}/api/rescue/complete/${assignment.id}`, {
        method: "POST",
        headers: {
          "x-clerk-user-id": userId,
        },
      });

      const data = await res.json();
      
      if (data.ok) {
        // Trigger confetti!
        confetti({
          particleCount: 150,
          spread: 100,
          origin: { y: 0.6 }
        });

        // Show celebration
        setShowCelebration(true);
        setCelebrationMessage(
          data.nextAssignment 
            ? getRandomMessage(ENCOURAGEMENT.completion)
            : getRandomMessage(ENCOURAGEMENT.allDone)
        );

        // After celebration, either show next or exit
        setTimeout(() => {
          setShowCelebration(false);
          if (data.nextAssignment) {
            setAssignment(data.nextAssignment);
            setRemainingCount(data.remainingCount || 0);
          } else {
            // All done!
            onComplete?.();
            onClose();
          }
        }, 2500);
      }
    } catch (e: any) {
      console.error("[RescueMode] Complete error:", e);
    } finally {
      setCompleting(false);
    }
  };

  // Handle timer completion
  const handleTimerComplete = () => {
    setShowTimer(false);
    // Refresh to check if they want to continue
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center">
      {/* Subtle animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 text-white/40 hover:text-white/80 transition-colors p-2"
        aria-label="Exit Rescue Mode"
      >
        <XIcon />
      </button>

      {/* Main content */}
      <div className="relative max-w-xl w-full mx-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/10 text-white mb-4">
            <LifebuoyIcon />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Rescue Mode</h1>
          <p className="text-white/60">
            {getRandomMessage(ENCOURAGEMENT.starting)}
          </p>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full mx-auto mb-4" />
            <p className="text-white/60">Finding your top priority...</p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="bg-red-500/20 backdrop-blur-lg rounded-3xl p-8 text-center">
            <p className="text-red-200 mb-4">{error}</p>
            <button
              onClick={fetchPriority}
              className="px-6 py-2 bg-white/20 hover:bg-white/30 text-white rounded-full transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* No assignments */}
        {!loading && !error && !assignment && (
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-white mb-2">You're all caught up!</h2>
            <p className="text-white/60 mb-6">No urgent assignments right now. Nice work!</p>
            <button
              onClick={onClose}
              className="px-8 py-3 bg-white text-purple-900 font-semibold rounded-full hover:bg-white/90 transition-colors"
            >
              Exit Rescue Mode
            </button>
          </div>
        )}

        {/* Celebration overlay */}
        {showCelebration && (
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 text-center animate-in fade-in zoom-in duration-300">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-white mb-2">{celebrationMessage}</h2>
          </div>
        )}

        {/* Assignment card */}
        {!loading && !error && assignment && !showCelebration && (
          <div className="bg-white/10 backdrop-blur-lg rounded-3xl overflow-hidden">
            {/* Assignment header */}
            <div className="p-8 text-center border-b border-white/10">
              <p className="text-white/40 text-sm font-medium uppercase tracking-wider mb-2">
                Just focus on this
              </p>
              <h2 className="text-2xl font-bold text-white mb-2">
                {assignment.title}
              </h2>
              {assignment.courseName && (
                <p className="text-white/60">{assignment.courseName}</p>
              )}
            </div>

            {/* Due date */}
            <div className="px-8 py-4 border-b border-white/10 flex items-center justify-center gap-2">
              <ClockIcon />
              <span className={`font-medium ${
                assignment.hoursUntilDue && assignment.hoursUntilDue < 24 
                  ? 'text-orange-300' 
                  : 'text-white/80'
              }`}>
                {assignment.dueDescription}
              </span>
            </div>

            {/* Checklist (if available from Wall of Awful) */}
            {assignment.hasChecklist && assignment.checklistItems.length > 0 && (
              <div className="px-8 py-4 border-b border-white/10">
                <p className="text-white/40 text-xs font-medium uppercase tracking-wider mb-3">
                  Broken down for you
                </p>
                <div className="space-y-2">
                  {assignment.checklistItems.slice(0, 5).map((item) => (
                    <div 
                      key={item.id}
                      className={`flex items-center gap-3 p-3 rounded-xl ${
                        item.isCompleted 
                          ? 'bg-green-500/20 text-green-300' 
                          : 'bg-white/5 text-white/80'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        item.isCompleted 
                          ? 'border-green-400 bg-green-400' 
                          : 'border-white/40'
                      }`}>
                        {item.isCompleted && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      <span className={item.isCompleted ? 'line-through' : ''}>{item.text}</span>
                    </div>
                  ))}
                  {assignment.checklistItems.length > 5 && (
                    <p className="text-white/40 text-sm text-center">
                      +{assignment.checklistItems.length - 5} more steps
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="p-8 space-y-3">
              <button
                onClick={() => setShowTimer(true)}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-2xl transition-colors"
              >
                <PlayIcon />
                Start 10 Minutes
              </button>
              
              <button
                onClick={handleComplete}
                disabled={completing}
                className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-green-500 hover:bg-green-400 text-white font-semibold rounded-2xl transition-colors disabled:opacity-50"
              >
                <CheckIcon />
                {completing ? 'Marking Complete...' : 'I Finished It!'}
              </button>
            </div>

            {/* Footer info */}
            {remainingCount > 0 && (
              <div className="px-8 pb-6 text-center">
                <p className="text-white/40 text-sm">
                  {remainingCount} more {remainingCount === 1 ? 'assignment' : 'assignments'} after this
                </p>
              </div>
            )}
          </div>
        )}

        {/* Exit link */}
        {!loading && assignment && !showCelebration && (
          <div className="text-center mt-6">
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white/60 text-sm transition-colors"
            >
              Exit Rescue Mode
            </button>
          </div>
        )}
      </div>

      {/* Focus Timer Modal */}
      {showTimer && assignment && (
        <FocusTimerModal
          userId={userId}
          assignmentId={assignment.id}
          title={assignment.title}
          category={null}
          currentPagesCompleted={null}
          totalPages={null}
          onClose={() => setShowTimer(false)}
          onLogged={handleTimerComplete}
        />
      )}
    </div>
  );
}

// ============================================================================
// RESCUE MODE TRIGGER BUTTON
// ============================================================================

interface RescueModeTriggerProps {
  userId: string;
  onActivate: () => void;
  autoSuggest?: boolean;
  className?: string;
}

export function RescueModeTrigger({ userId, onActivate, autoSuggest = true, className = "" }: RescueModeTriggerProps) {
  const [shouldSuggest, setShouldSuggest] = useState(false);
  const [suggestReason, setSuggestReason] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Check if we should auto-suggest
  useEffect(() => {
    if (!autoSuggest || !userId || dismissed) return;

    const checkSuggestion = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/rescue/should-suggest`, {
          headers: {
            "x-clerk-user-id": userId,
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.shouldSuggest) {
            setShouldSuggest(true);
            setSuggestReason(data.reason);
          }
        }
      } catch (e) {
        // Silently fail
      }
    };

    checkSuggestion();
  }, [userId, autoSuggest, dismissed]);

  // Auto-suggest banner
  if (shouldSuggest && !dismissed) {
    return (
      <div className={`bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl p-4 shadow-lg ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <LifebuoyIcon />
            </div>
            <div>
              <p className="text-white font-semibold">Feeling overwhelmed?</p>
              <p className="text-white/80 text-sm">{suggestReason}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDismissed(true)}
              className="px-3 py-1.5 text-white/60 hover:text-white text-sm transition-colors"
            >
              Not now
            </button>
            <button
              onClick={onActivate}
              className="px-4 py-2 bg-white text-purple-700 font-semibold rounded-full text-sm hover:bg-white/90 transition-colors"
            >
              Help me focus
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Standard trigger button
  return (
    <button
      onClick={onActivate}
      className={`flex items-center gap-2 px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 font-medium rounded-full transition-colors ${className}`}
    >
      <LifebuoyIcon />
      <span>Help me focus</span>
    </button>
  );
}

