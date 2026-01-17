"use client";
import { useEffect, useState, Suspense } from "react";
import { Calendar } from "../../../components/Calendar";
import { CalendarLegend } from "../../../components/CalendarLegend";
import { ProposalPanel } from "../../../components/ProposalPanel";
import { StuckAssignmentModal } from "../../../components/StuckAssignmentModal";
import { OptimizeScheduleButton } from "../../../components/OptimizeScheduleButton";
import { QuickAddInput } from "../../../components/QuickAddInput";
import { useUser } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { cn } from "../../../lib/utils";
import { BentoTileSkeleton } from "../../../components/ui/Skeleton";
import { Loader2 } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "https://gessoapi-production.up.railway.app";

function CalendarPageContent() {
  const { user, isLoaded } = useUser();
  const searchParams = useSearchParams();
  const assignmentId = searchParams.get("assignmentId");
  const [error, setError] = useState<string>("");
  const [showLegend, setShowLegend] = useState(false);
  const [proposalPanelOpen, setProposalPanelOpen] = useState(false);
  const [hasProposal, setHasProposal] = useState(false);
  const [appliedProposal, setAppliedProposal] = useState<{ id: string; timeRemainingMinutes: number } | null>(null);
  const [stuckModalOpen, setStuckModalOpen] = useState(false);
  const [stuckAssignmentId, setStuckAssignmentId] = useState<string | null>(null);
  const [stuckEventId, setStuckEventId] = useState<string | null>(null);

  const [assignmentTitle, setAssignmentTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id || !assignmentId) return;

    const highlightAssignment = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/assignments/${assignmentId}/details`, {
          headers: { "x-clerk-user-id": user.id },
        });
        const data = await res.json();
        if (data.ok && data.assignment) {
          setAssignmentTitle(data.assignment.title);
          if (data.focusBlocks && data.focusBlocks.length > 0) {
            const eventIds = data.focusBlocks.map((b: any) => b.id);
            // Wait a moment for the title to update and components to settle
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent("highlightFocusBlocks", {
                detail: { eventIds }
              }));
            }, 500);
          }
        }
      } catch (err) {
        console.error("Failed to fetch assignment details for highlighting:", err);
      }
    };

    highlightAssignment();

    return () => {
      window.dispatchEvent(new CustomEvent("highlightFocusBlocks", {
        detail: { eventIds: [] }
      }));
    };
  }, [user?.id, assignmentId]);

  useEffect(() => {
    if (isLoaded && user?.id) {
      setError("");
      checkForProposal();
      checkForAppliedProposal();
    }
  }, [isLoaded, user?.id]);

  useEffect(() => {
    const handleOptimizationReady = (event: any) => {
      checkForProposal();
    };
    window.addEventListener('optimizationReady', handleOptimizationReady as EventListener);
    return () => window.removeEventListener('optimizationReady', handleOptimizationReady as EventListener);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const interval = setInterval(() => {
      checkForAppliedProposal();
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, [user?.id]);

  async function checkForProposal() {
    if (!user?.id) return;
    try {
      const res = await fetch(`${API_BASE}/api/rebalancing/proposals`, {
        headers: { "x-clerk-user-id": user.id },
      });
      if (res.ok) {
        const data = await res.json();
        setHasProposal(data.ok && data.proposal !== null);
      }
    } catch (e) {
      console.error("Error checking for proposal:", e);
    }
  }

  async function checkForAppliedProposal() {
    if (!user?.id) return;
    try {
      const res = await fetch(`${API_BASE}/api/rebalancing/applied`, {
        headers: { "x-clerk-user-id": user.id },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.ok && data.proposal && data.proposal.timeRemainingMinutes > 0) {
          setAppliedProposal({
            id: data.proposal.id,
            timeRemainingMinutes: data.proposal.timeRemainingMinutes
          });
        } else {
          setAppliedProposal(null);
        }
      }
    } catch (e) {
      console.error("Error checking for applied proposal:", e);
    }
  }

  async function onMove(id: string, start: Date, end: Date) {
    if (!user?.id) return;
    try {
      const res = await fetch(`${API_BASE}/api/calendar/event-drop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-clerk-user-id": user.id,
        },
        body: JSON.stringify({ id, start, end }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update event");
      }
      const data = await res.json();
      if (data.deferral?.isStuck && data.deferral?.linkedAssignmentId) {
        setStuckAssignmentId(data.deferral.linkedAssignmentId);
        setStuckEventId(id);
        setStuckModalOpen(true);
      }
    } catch (e: any) {
      console.error("Error moving event:", e);
      throw e;
    }
  }

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-brand-gesso">
        <div className="fixed inset-0 gesso-texture z-0 pointer-events-none" />
        <div className="sticky top-0 z-30 bg-brand-gesso/80 backdrop-blur-md pt-8 pb-4 px-6 md:px-12">
          <div className="max-w-7xl mx-auto">
            <div className="h-14 bg-white/40 rounded-[2.5rem] animate-pulse" />
          </div>
        </div>
        <main className="px-6 py-12 md:px-12 md:py-16 max-w-7xl mx-auto relative z-10">
          <div className="space-y-4 mb-12">
            <div className="h-12 w-64 bg-brand-surface-2/60 rounded-2xl animate-pulse" />
          </div>
          <div className="bg-brand-surface rounded-[2.5rem] cozy-border shadow-soft h-[600px] animate-pulse" />
        </main>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-brand-gesso selection:bg-brand-primary/10 selection:text-brand-primary">
      <div className="fixed inset-0 gesso-texture z-0 pointer-events-none" />

      {/* Sticky Quick Add (Top) */}
      <div className="sticky top-0 z-30 bg-brand-gesso/80 backdrop-blur-md pt-8 pb-4 px-6 md:px-12">
        <div className="max-w-7xl mx-auto">
          <QuickAddInput />
        </div>
      </div>

      <main className="px-6 py-12 md:px-12 md:py-16 max-w-7xl mx-auto space-y-12 relative z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="space-y-4">
            <h1 className="text-5xl md:text-7xl font-serif font-black text-brand-text tracking-tighter leading-none">
              Schedule
            </h1>
            <p className="text-brand-muted font-medium text-lg md:text-xl">
              Drag, drop, and reclaim your time.
            </p>
          </div>
          
          <div className="flex items-center gap-3 bg-brand-surface-2 p-1.5 rounded-full cozy-border">
            <button
              onClick={() => setShowLegend((prev) => !prev)}
              className={cn(
                "px-6 py-2 rounded-full text-[12px] font-bold uppercase tracking-[0.1em] transition-all",
                showLegend ? "bg-brand-surface text-brand-text shadow-soft" : "text-brand-muted hover:text-brand-text"
              )}
            >
              {showLegend ? "Hide Legend" : "Show Legend"}
            </button>
            <OptimizeScheduleButton
              userId={user.id}
              onOptimizationComplete={(proposalId, movesCount) => {
                if (movesCount > 0) {
                  setAppliedProposal(null);
                  setHasProposal(true);
                  setProposalPanelOpen(true);
                }
              }}
            />
          </div>
        </div>

        {assignmentId && assignmentTitle && (
          <div className="bg-brand-primary/10 border-2 border-brand-primary/30 rounded-[2rem] p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-aura-green animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-brand-primary text-white flex items-center justify-center shadow-lg animate-pulse">
                <span className="text-2xl">🎯</span>
              </div>
              <div className="space-y-1">
                <p className="text-brand-text font-black text-xl italic leading-none">
                  Rescheduling: {assignmentTitle}
                </p>
                <p className="text-brand-muted font-medium text-sm">
                  We've highlighted your existing blocks. Drag one to a new spot or add a new one!
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.delete("assignmentId");
                url.searchParams.delete("reschedule");
                window.history.replaceState({}, '', url.toString());
                setAssignmentTitle(null);
                window.dispatchEvent(new CustomEvent("highlightFocusBlocks", { detail: { eventIds: [] } }));
              }}
              className="bg-white text-brand-text px-8 py-3 rounded-full text-[11px] font-black uppercase tracking-widest shadow-soft hover:bg-brand-surface-2 transition-all border border-brand-border/40"
            >
              Done Rescheduling
            </button>
          </div>
        )}

        {hasProposal && !proposalPanelOpen && !appliedProposal && (
          <div className="bg-brand-primary/5 border border-brand-primary/20 rounded-[1.5rem] p-6 flex items-center justify-between shadow-soft animate-fade-in">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-brand-primary/10 rounded-full flex items-center justify-center">
                <span className="text-brand-primary text-xl">✨</span>
              </div>
              <p className="text-brand-text font-bold">
                Schedule improvements available!
              </p>
            </div>
            <button
              onClick={() => setProposalPanelOpen(true)}
              className="bg-brand-primary text-white px-6 py-2 rounded-full text-sm font-bold shadow-soft hover:brightness-110 transition-all"
            >
              View Proposals
            </button>
          </div>
        )}

        {appliedProposal && (
          <div className="bg-brand-mint/5 border border-brand-mint/20 rounded-[1.5rem] p-6 flex items-center justify-between shadow-soft animate-fade-in">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-brand-mint/10 rounded-full flex items-center justify-center text-brand-mint text-xl">
                ✓
              </div>
              <div>
                <p className="text-brand-text font-bold">Schedule changes applied</p>
                <p className="text-brand-muted text-sm font-medium">
                  Undo window: {appliedProposal.timeRemainingMinutes}m
                </p>
              </div>
            </div>
            <button
              onClick={() => setProposalPanelOpen(true)}
              className="bg-brand-mint text-white px-6 py-2 rounded-full text-sm font-bold shadow-soft hover:brightness-110 transition-all"
            >
              Undo Changes
            </button>
          </div>
        )}

        {showLegend && (
          <div className="animate-slide-up">
            <CalendarLegend />
          </div>
        )}

        <div className="bg-brand-surface rounded-[2.5rem] cozy-border shadow-soft p-4 md:p-8 relative overflow-hidden">
          <Calendar events={[]} onMove={onMove} userId={user.id} />
        </div>

        <ProposalPanel
          isOpen={proposalPanelOpen}
          onClose={() => {
            setProposalPanelOpen(false);
            checkForProposal();
            checkForAppliedProposal();
          }}
          userId={user.id}
          mode={appliedProposal ? 'undo' : 'propose'}
          proposalId={appliedProposal?.id}
          onProposalApplied={() => {
            checkForProposal();
            checkForAppliedProposal();
            setTimeout(() => window.location.reload(), 500);
          }}
        />
        
        {stuckModalOpen && stuckAssignmentId && (
          <StuckAssignmentModal
            key={stuckAssignmentId}
            assignmentId={stuckAssignmentId}
            userId={user.id}
            eventId={stuckEventId || undefined}
            onClose={() => {
              setStuckModalOpen(false);
              setStuckAssignmentId(null);
              setStuckEventId(null);
              setTimeout(() => window.location.reload(), 500);
            }}
          />
        )}
      </main>
    </div>
  );
}

export default function CalendarPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-brand-gesso flex items-center justify-center">
        <Loader2 className="animate-spin text-brand-primary" size={40} />
      </div>
    }>
      <CalendarPageContent />
    </Suspense>
  );
}
