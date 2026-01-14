"use client";
import { useEffect, useState } from "react";
import { Calendar } from "../../../components/Calendar";
import { CalendarLegend } from "../../../components/CalendarLegend";
import { ProposalPanel } from "../../../components/ProposalPanel";
import { StuckAssignmentModal } from "../../../components/StuckAssignmentModal";
import { OptimizeScheduleButton } from "../../../components/OptimizeScheduleButton";
import { useUser } from "@clerk/nextjs";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8787";

export default function CalendarPage() {
  const { user, isLoaded } = useUser();
  const [error, setError] = useState<string>("");
  const [proposalPanelOpen, setProposalPanelOpen] = useState(false);
  const [hasProposal, setHasProposal] = useState(false);
  const [appliedProposal, setAppliedProposal] = useState<{ id: string; timeRemainingMinutes: number } | null>(null);
  const [stuckModalOpen, setStuckModalOpen] = useState(false);
  const [stuckAssignmentId, setStuckAssignmentId] = useState<string | null>(null);
  const [stuckEventId, setStuckEventId] = useState<string | null>(null);

  console.log('[CalendarPage] Render state:', { isLoaded, hasUser: !!user, userId: user?.id });
  
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:RENDER',message:'CalendarPage render',data:{stuckModalOpen,stuckAssignmentId,isLoaded,hasUser:!!user},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H,I'})}).catch(()=>{});
  // #endregion
  
  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:STATE_EFFECT',message:'Stuck modal state changed',data:{stuckModalOpen,stuckAssignmentId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H,I'})}).catch(()=>{});
  }, [stuckModalOpen, stuckAssignmentId]);
  // #endregion

  // Clear error when user loads
  useEffect(() => {
    if (isLoaded && user?.id) {
      setError("");
      checkForProposal();
      checkForAppliedProposal();
    }
  }, [isLoaded, user?.id]);

  // Listen for optimization ready events (from Quick Add auto-trigger)
  useEffect(() => {
    const handleOptimizationReady = (event: any) => {
      const { movesCount, reason } = event.detail;
      console.log('[Calendar] Optimization ready:', movesCount, 'moves,', reason);
      
      // Refresh proposal state and show banner
      checkForProposal();
      
      // Optionally auto-open the panel (can be disabled if too intrusive)
      // setProposalPanelOpen(true);
    };
    
    window.addEventListener('optimizationReady', handleOptimizationReady as EventListener);
    return () => window.removeEventListener('optimizationReady', handleOptimizationReady as EventListener);
  }, []);

  // Check for applied proposal periodically (every minute)
  useEffect(() => {
    if (!user?.id) return;
    
    const interval = setInterval(() => {
      checkForAppliedProposal();
    }, 60 * 1000); // Check every minute
    
    return () => clearInterval(interval);
  }, [user?.id]);

  // Check for existing proposal
  async function checkForProposal() {
    if (!user?.id) return;
    try {
      const res = await fetch(`${API_BASE}/api/rebalancing/proposals`, {
        headers: {
          "x-clerk-user-id": user.id,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setHasProposal(data.ok && data.proposal !== null);
      }
    } catch (e) {
      console.error("Error checking for proposal:", e);
    }
  }

  // Check for applied proposal (for undo option)
  async function checkForAppliedProposal() {
    if (!user?.id) return;
    try {
      const res = await fetch(`${API_BASE}/api/rebalancing/applied`, {
        headers: {
          "x-clerk-user-id": user.id,
        },
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

  async function handleRebalance() {
    if (!user?.id) return;
    
    try {
      console.log("[Calendar] Generating new proposal...");
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'calendar/page.tsx:REBALANCE_START',message:'Rebalance clicked',data:{userId:user.id.substring(0,8)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      
      // Clear any existing applied proposal state
      setAppliedProposal(null);
      
      // Generate a new proposal
      const res = await fetch(`${API_BASE}/api/rebalancing/propose`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-clerk-user-id": user.id,
        },
        body: JSON.stringify({ energyLevel: 5 }), // Default energy level
      });

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'calendar/page.tsx:REBALANCE_RESPONSE',message:'Response received',data:{ok:res.ok,status:res.status,contentType:res.headers.get('content-type')},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,D,E'})}).catch(()=>{});
      // #endregion

      if (!res.ok) {
        const responseText = await res.text();
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'calendar/page.tsx:REBALANCE_NOT_OK',message:'Response not ok',data:{status:res.status,responseText:responseText.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,D'})}).catch(()=>{});
        // #endregion
        const data = await res.json();
        throw new Error(data.error || "Failed to generate proposal");
      }

      const data = await res.json();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'calendar/page.tsx:REBALANCE_SUCCESS',message:'Proposal data parsed',data:{ok:data.ok,movesCount:data.moves_count},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      if (data.ok) {
        setHasProposal(true);
        console.log("[Calendar] Opening panel in 'propose' mode");
        setProposalPanelOpen(true);
        // Panel will open in 'propose' mode and fetch the new proposal
      }
    } catch (e: any) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'calendar/page.tsx:REBALANCE_CATCH',message:'Error caught',data:{error:e.message,name:e.name},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,E'})}).catch(()=>{});
      // #endregion
      console.error("[Calendar] Error generating proposal:", e);
      alert(`Failed to generate proposal: ${e.message}`);
    }
  }

  async function onMove(id: string, start: Date, end: Date) {
    if (!user?.id) return;
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:ONMOVE_START',message:'onMove called',data:{id,start:start.toISOString(),end:end.toISOString(),userId:user.id.substring(0,8)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F,G'})}).catch(()=>{});
    // #endregion
    
    try {
      const res = await fetch(`${API_BASE}/api/calendar/event-drop`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-clerk-user-id": user.id,
        },
        body: JSON.stringify({ id, start, end }),
      });
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:ONMOVE_RESPONSE',message:'Response received',data:{ok:res.ok,status:res.status,contentType:res.headers.get('content-type')},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F,G'})}).catch(()=>{});
      // #endregion
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:ONMOVE_ERROR',message:'Response not ok',data:{status:res.status,error:data.error},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'})}).catch(()=>{});
        // #endregion
        throw new Error(data.error || "Failed to update event");
      }
      
      const data = await res.json();
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:ONMOVE_DATA',message:'Response data parsed',data:{deferral:data.deferral,isStuckInDeferral:data.deferral?.isStuck,linkedIdInDeferral:data.deferral?.linkedAssignmentId,dataKeys:Object.keys(data)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'G,H'})}).catch(()=>{});
      // #endregion
      
      // Check if assignment is stuck (Wall of Awful detected)
      // FIXED: isStuck and linkedAssignmentId are inside the deferral object
      if (data.deferral?.isStuck && data.deferral?.linkedAssignmentId) {
        console.log('[Page] Wall of Awful detected in response:', data.deferral.linkedAssignmentId);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:ONMOVE_STUCK_DETECTED',message:'Setting stuck modal state',data:{linkedAssignmentId:data.deferral.linkedAssignmentId,eventId:id,stuckModalOpenBefore:stuckModalOpen,stuckAssignmentIdBefore:stuckAssignmentId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H'})}).catch(()=>{});
        // #endregion
        setStuckAssignmentId(data.deferral.linkedAssignmentId);
        setStuckEventId(id);
        setStuckModalOpen(true);
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:ONMOVE_STUCK_STATE_SET',message:'Stuck modal state set',data:{linkedAssignmentId:data.deferral.linkedAssignmentId,eventId:id},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'H'})}).catch(()=>{});
        // #endregion
      } else {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:ONMOVE_NOT_STUCK',message:'Not stuck or missing data',data:{hasDeferral:!!data.deferral,isStuck:data.deferral?.isStuck,linkedAssignmentId:data.deferral?.linkedAssignmentId},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'G,H'})}).catch(()=>{});
        // #endregion
      }
      
      // Calendar component will automatically refresh events on next render
    } catch (e: any) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:ONMOVE_CATCH',message:'Error caught',data:{error:e.message,name:e.name,stack:e.stack?.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'F'})}).catch(()=>{});
      // #endregion
      console.error("Error moving event:", e);
      alert(`Failed to move event: ${e.message}`);
      // Re-throw so Calendar.tsx can catch it and revert visual changes
      throw e;
    }
  }

  if (!isLoaded || !user?.id) {
    return (
      <main className="p-4">
        <h1 className="text-xl font-semibold mb-4">Calendar</h1>
        <div className="text-center text-gray-500 py-8">Loading...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-4">
        <h1 className="text-xl font-semibold mb-4">Calendar</h1>
        <div className="p-4 bg-red-50 border border-red-200 rounded text-red-700">
          {error}
        </div>
      </main>
    );
  }

  // Show loading only while Clerk is still loading
  if (!isLoaded) {
    return (
      <main className="p-4">
        <h1 className="text-xl font-semibold mb-4">Calendar</h1>
        <p>Loading user...</p>
      </main>
    );
  }

  // If loaded but no user, this shouldn't happen in protected route but handle it
  if (!user) {
    return (
      <main className="p-4">
        <h1 className="text-xl font-semibold mb-4">Calendar</h1>
        <p>Not authenticated. Redirecting...</p>
      </main>
    );
  }

  return (
    <main className="p-4 relative">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Calendar</h1>
        <div className="flex items-center gap-2">
          {hasProposal && !appliedProposal && (
            <button
              onClick={() => setProposalPanelOpen(true)}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              View Proposals
            </button>
          )}
          <OptimizeScheduleButton
            userId={user.id}
            onOptimizationComplete={(proposalId, movesCount) => {
              if (movesCount > 0) {
                console.log('[Calendar] Optimization complete, opening proposal panel');
                // Clear any applied proposal state so we open in 'propose' mode
                setAppliedProposal(null);
                setHasProposal(true);
                setProposalPanelOpen(true);
              }
            }}
          />
          <div className="px-4 py-2 text-sm text-gray-500 italic">
            💡 Use the Quick Add input in the top nav (Alt+Q)
          </div>
        </div>
      </div>
      
      {hasProposal && !proposalPanelOpen && !appliedProposal && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
          <p className="text-blue-900">
            <strong>Proposed schedule adjustments available</strong>
            <button
              onClick={() => setProposalPanelOpen(true)}
              className="ml-2 text-blue-600 underline hover:text-blue-800"
            >
              View Proposals
            </button>
          </p>
        </div>
      )}

      {appliedProposal && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded flex items-center justify-between text-sm">
          <p className="text-green-900">
            <strong>Schedule changes applied</strong>
            <span className="ml-2 text-green-700">
              You can undo within {appliedProposal.timeRemainingMinutes} minutes
            </span>
          </p>
          <button
            onClick={() => {
              console.log("[Calendar] Opening panel in 'undo' mode for proposal:", appliedProposal.id);
              setProposalPanelOpen(true);
              // Panel will open in 'undo' mode since appliedProposal is set
            }}
            className="ml-4 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
          >
            Undo Changes
          </button>
        </div>
      )}

      <div className="mb-4">
        <CalendarLegend />
      </div>

      <Calendar events={[]} onMove={onMove} userId={user.id} />
      
      {user.id && (
        <>
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
              // Refresh proposal check and calendar
              checkForProposal();
              checkForAppliedProposal();
              // Refresh calendar events (could use a more elegant refresh)
              setTimeout(() => window.location.reload(), 500);
            }}
          />
          
          {(() => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'page.tsx:MODAL_RENDER_CHECK',message:'Modal render condition check',data:{stuckModalOpen,stuckAssignmentId,shouldRender:!!(stuckModalOpen && stuckAssignmentId),userId:user.id.substring(0,8)},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'I'})}).catch(()=>{});
            // #endregion
            
            return stuckModalOpen && stuckAssignmentId ? (
              <StuckAssignmentModal
                key={stuckAssignmentId}
                assignmentId={stuckAssignmentId}
                userId={user.id}
                eventId={stuckEventId || undefined}
                onClose={() => {
                  console.log('[Page] Closing stuck assignment modal');
                  setStuckModalOpen(false);
                  setStuckAssignmentId(null);
                  setStuckEventId(null);
                  // Optionally refresh calendar
                  setTimeout(() => window.location.reload(), 500);
                }}
              />
            ) : null;
          })()}
        </>
      )}
    </main>
  );
}
