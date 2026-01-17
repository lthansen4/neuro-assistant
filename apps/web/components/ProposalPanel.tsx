"use client";
import React, { useState, useEffect, useRef } from "react";
import { getReasonExplanation, type ReasonExplanation } from "../lib/reasonCodes";

// Icons - using simple SVG or emoji fallback if lucide-react not available
const XIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;
const AlertIcon = () => <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
const InfoIcon = () => <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const ArrowRightIcon = () => <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>;

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "https://gessoapi-production.up.railway.app";

// Educational Reason Badge Component
function ReasonBadge({ code }: { code: string }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const explanation = getReasonExplanation(code);
  
  const handleShowTooltip = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setTooltipPosition({
        top: rect.top - 8, // Position above the button
        left: Math.max(8, rect.left) // Keep within viewport
      });
    }
    setShowTooltip(true);
  };
  
  if (!explanation) {
    // Fallback for unknown codes - display the raw code in a readable format
    const readableCode = code.replace(/_/g, ' ').toLowerCase();
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-gray-100 text-gray-700">
        {readableCode}
      </span>
    );
  }
  
  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onMouseEnter={handleShowTooltip}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={(e) => {
          e.stopPropagation();
          if (showTooltip) {
            setShowTooltip(false);
          } else {
            handleShowTooltip();
          }
        }}
        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs hover:bg-blue-200 transition-colors cursor-help"
      >
        <span>{explanation.icon}</span>
        <span>{explanation.short}</span>
      </button>
      
      {showTooltip && (
        <div 
          className="fixed z-[9999] w-72 p-3 bg-gray-900 text-white text-sm rounded-lg shadow-xl transform -translate-y-full"
          style={{ 
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            animation: 'fadeIn 0.2s'
          }}
        >
          <p className="font-semibold mb-1">{explanation.short}</p>
          <p className="text-xs leading-relaxed opacity-90">{explanation.explanation}</p>
          <div className="absolute -bottom-1 left-4 w-2 h-2 bg-gray-900 transform rotate-45"></div>
        </div>
      )}
    </div>
  );
}

interface ProposalMove {
  id: string;
  moveType: 'insert' | 'move' | 'resize' | 'delete';
  sourceEventId?: string;
  targetStartAt?: string;
  targetEndAt?: string;
  deltaMinutes?: number;
  churnCost: number;
  category?: string;
  reasonCodes: string[];
  feasibilityFlags?: Record<string, any>;
  metadata?: Record<string, any>;
}

interface Proposal {
  id: string;
  trigger: string;
  cause?: any;
  energyLevel?: number;
  movesCount: number;
  churnCostTotal: number;
  status: string;
  createdAt: string;
  appliedAt?: string;
  moves: ProposalMove[];
}

interface ProposalPanelProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  mode: 'propose' | 'undo'; // Explicit intent!
  proposalId?: string | null; // Only used when mode='undo'
  onProposalApplied?: () => void;
}

export function ProposalPanel({ isOpen, onClose, userId, mode, proposalId, onProposalApplied }: ProposalPanelProps) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [selectedMoves, setSelectedMoves] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string>("");
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Fetch proposal when panel opens - explicit logic based on mode
  useEffect(() => {
    if (isOpen && userId) {
      console.log(`[ProposalPanel] Opening in ${mode} mode`);
      
      if (mode === 'undo') {
        // Show specific applied proposal for undo
        if (!proposalId) {
          console.error('[ProposalPanel] mode=undo but no proposalId provided!');
          setError('No proposal to undo');
          return;
        }
        console.log(`[ProposalPanel] Fetching applied proposal: ${proposalId}`);
        fetchAppliedProposal(proposalId);
      } else {
        // Show latest proposed proposal for accept/reject
        console.log('[ProposalPanel] Fetching latest proposed proposal');
        fetchProposal();
      }
    }
  }, [isOpen, userId, mode, proposalId]);

  // Fetch an applied proposal by ID (for undo)
  async function fetchAppliedProposal(id: string) {
    setLoading(true);
    setError("");
    try {
      console.log(`[ProposalPanel] Fetching applied proposal with ID: ${id}`);
      const res = await fetch(`${API_BASE}/api/rebalancing/proposals/${id}`, {
        headers: {
          "x-clerk-user-id": userId,
        },
      });

      if (!res.ok) {
        throw new Error("Failed to fetch applied proposal");
      }

      const data = await res.json();
      console.log("[ProposalPanel] Fetched applied proposal data:", data);
      
      if (data.ok && data.proposal) {
        console.log(`[ProposalPanel] Applied proposal status: ${data.proposal.status}`);
        setProposal(data.proposal);
        
        // Select all moves by default for undo
        if (data.proposal.moves && data.proposal.moves.length > 0) {
          setSelectedMoves(new Set(data.proposal.moves.map((m: ProposalMove) => m.id)));
        } else {
          setSelectedMoves(new Set());
        }
      } else {
        console.warn("[ProposalPanel] No applied proposal data found");
        setProposal(null);
        setSelectedMoves(new Set());
      }
    } catch (e: any) {
      console.error("[ProposalPanel] Error fetching applied proposal:", e);
      setError("Failed to load undo information");
      setProposal(null);
      setSelectedMoves(new Set());
    } finally {
      setLoading(false);
    }
  }

  async function fetchProposal() {
    setLoading(true);
    setError("");
    try {
      console.log("[ProposalPanel] Fetching latest proposed proposal");
      const res = await fetch(`${API_BASE}/api/rebalancing/proposals`, {
        headers: {
          "x-clerk-user-id": userId,
        },
      });

      if (!res.ok) {
        throw new Error("Failed to fetch proposal");
      }

      const data = await res.json();
      console.log("[ProposalPanel] Fetched proposal data:", data);
      console.log("[ProposalPanel] Raw proposal object:", JSON.stringify(data.proposal, null, 2));
      
      if (data.ok && data.proposal) {
        console.log(`[ProposalPanel] Proposal has ${data.proposal.moves?.length || 0} moves, status: ${data.proposal.status}`);
        console.log(`[ProposalPanel] Moves array:`, data.proposal.moves);
        if (data.proposal.moves && data.proposal.moves.length > 0) {
          console.log("[ProposalPanel] First move:", {
            id: data.proposal.moves[0].id,
            moveType: data.proposal.moves[0].moveType,
            title: data.proposal.moves[0].metadata?.title || data.proposal.moves[0].metadata?.eventTitle,
            originalStartAt: data.proposal.moves[0].metadata?.originalStartAt,
            targetStartAt: data.proposal.moves[0].targetStartAt
          });
        }
        setProposal(data.proposal);
        
        // Select all moves by default
        if (data.proposal.moves && data.proposal.moves.length > 0) {
          setSelectedMoves(new Set(data.proposal.moves.map((m: ProposalMove) => m.id)));
        } else {
          setSelectedMoves(new Set());
        }
      } else {
        console.log("[ProposalPanel] No proposal found");
        setProposal(null);
        setSelectedMoves(new Set());
      }
    } catch (e: any) {
      console.error("[ProposalPanel] Error fetching proposal:", e);
      setError(e.message || "Failed to load proposal");
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!proposal || selectedMoves.size === 0) return;

    // Check if proposal is still in 'proposed' status
    if (proposal.status !== 'proposed') {
      setError(`This proposal has been ${proposal.status}. Please generate a new proposal.`);
      // Refresh to get updated proposal or clear it
      await fetchProposal();
      return;
    }

    setApplying(true);
    setError("");
    try {
      // Send only the selected move IDs
      const selectedMoveIds = Array.from(selectedMoves);
      console.log(`[ProposalPanel] Applying ${selectedMoveIds.length} selected moves:`, selectedMoveIds);
      
      const res = await fetch(`${API_BASE}/api/rebalancing/proposal/${proposal.id}/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-clerk-user-id": userId,
        },
        body: JSON.stringify({ 
          selectedMoveIds: selectedMoveIds // Send selected move IDs
        }),
      });

      const result = await res.json();
      
      if (!res.ok) {
        // Check for specific error types
        if (result.shouldRefresh) {
          throw new Error('STALE_PROPOSAL: ' + (result.detail || result.error));
        }
        throw new Error(result.detail || result.error || "Failed to apply proposal");
      }

      if (result.ok) {
        console.log(`[ProposalPanel] Successfully applied ${result.applied || 0} changes`);
        // Update the current proposal's status to 'applied' in local state
        if (proposal) {
          setProposal({
            ...proposal,
            status: 'applied' as const
          });
        }
        // Notify parent to refresh
        onProposalApplied?.();
        
        // Show appropriate success message
        const appliedCount = result.applied || 0;
        const skippedCount = result.skipped || 0;
        let message = `Applied ${appliedCount} change${appliedCount === 1 ? '' : 's'}.`;
        if (skippedCount > 0) {
          message += ` ${skippedCount} were skipped due to conflicts.`;
        }
        message += ' You can undo within 30 minutes.';
        alert(message);
        // Close panel so user can see the undo banner
        onClose();
      }
    } catch (e: any) {
      console.error("[ProposalPanel] Error applying proposal:", e);
      const errorMsg = e.message || "Failed to apply proposal";
      setError(errorMsg);
      
      // If proposal is stale/cancelled/rejected, clear it and guide user to generate a new one
      if (errorMsg.includes('STALE_PROPOSAL') || errorMsg.includes('cancelled') || errorMsg.includes('APPLY_UNAVAILABLE') || errorMsg.includes('out of date')) {
        console.warn("[ProposalPanel] Proposal is stale, clearing state");
        // Clear the proposal from state
        setProposal(null);
        setSelectedMoves(new Set());
        // Show guidance
        alert("This proposal is out of date. Please generate a new proposal by clicking the 'Rebalance' button.");
        onClose(); // Close the panel so user can generate a new proposal
      }
    } finally {
      setApplying(false);
    }
  }

  async function handleUndo() {
    if (!proposal?.id) {
      console.error("[ProposalPanel] Cannot undo: no proposal ID");
      return;
    }

    setApplying(true);
    setError("");
    try {
      console.log(`[ProposalPanel] Undoing proposal: ${proposal.id}`);
      const res = await fetch(`${API_BASE}/api/rebalancing/proposal/${proposal.id}/undo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-clerk-user-id": userId,
        },
      });

      const result = await res.json();
      
      if (!res.ok) {
        throw new Error(result.error || result.detail || "Failed to undo proposal");
      }

      if (result.ok) {
        console.log(`[ProposalPanel] Successfully undid proposal - restored ${result.restoredCount} events`);
        onProposalApplied?.();
        onClose();
        alert(`Reverted ${result.restoredCount} change${result.restoredCount === 1 ? '' : 's'} to your schedule.`);
      }
    } catch (e: any) {
      console.error("[ProposalPanel] Error undoing proposal:", e);
      setError(e.message || "Failed to undo proposal");
    } finally {
      setApplying(false);
    }
  }

  async function handleReject() {
    if (!proposal) return;

    setApplying(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/rebalancing/proposal/${proposal.id}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-clerk-user-id": userId,
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reject proposal");
      }

      // Clear the proposal from state so it doesn't show anymore
      setProposal(null);
      setSelectedMoves(new Set());
      onProposalApplied?.(); // Notify parent to refresh
      onClose();
      alert("No changes applied.");
    } catch (e: any) {
      console.error("Error rejecting proposal:", e);
      setError(e.message || "Failed to reject proposal");
    } finally {
      setApplying(false);
    }
  }

  function toggleMove(moveId: string) {
    const newSelected = new Set(selectedMoves);
    if (newSelected.has(moveId)) {
      newSelected.delete(moveId);
    } else {
      newSelected.add(moveId);
    }
    setSelectedMoves(newSelected);
  }

  function selectAll() {
    if (!proposal) return;
    setSelectedMoves(new Set(proposal.moves.map(m => m.id)));
  }

  function deselectAll() {
    setSelectedMoves(new Set());
  }

  function getStatusChip(move: ProposalMove) {
    if (move.feasibilityFlags?.conflict) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">
          <AlertIcon />
          CONFLICT
        </span>
      );
    }
    if (move.feasibilityFlags?.overLimit) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700">
          <AlertIcon />
          OVER LIMIT
        </span>
      );
    }
    if (move.moveType === 'insert') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
          <InfoIcon />
          NEW
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700">
        MOVE
      </span>
    );
  }

  function formatTime(dateStr?: string | Date) {
    if (!dateStr) return "N/A";
    const date = dateStr instanceof Date ? dateStr : new Date(dateStr);
    if (isNaN(date.getTime())) return "N/A";
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  function formatDate(dateStr?: string | Date) {
    if (!dateStr) return "N/A";
    const date = dateStr instanceof Date ? dateStr : new Date(dateStr);
    if (isNaN(date.getTime())) return "N/A";
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  if (!isOpen) return null;

  const panelClasses = isMobile
    ? "fixed inset-x-0 bottom-0 top-1/3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 shadow-lg z-50 flex flex-col"
    : "fixed right-0 top-0 bottom-0 w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-lg z-50 flex flex-col";

  return (
    <>
      {/* Backdrop overlay */}
      <div 
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Panel */}
      <div className={panelClasses}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div>
          <h2 className="text-lg font-semibold">Rebalancing Proposals</h2>
          {proposal && (
            <p className="text-sm text-gray-500">
              {proposal.movesCount} {proposal.movesCount === 1 ? 'change' : 'changes'} • {proposal.churnCostTotal} min churn
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded"
          aria-label="Close panel"
        >
          <XIcon />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="text-center py-8">
            <div className="text-4xl mb-2 animate-pulse">🔄</div>
            <p className="font-semibold text-gray-700">Analyzing your schedule...</p>
            <p className="text-xs text-gray-500 mt-2">
              Looking at deadlines, energy patterns, and workload balance
            </p>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm mb-4">
            {error}
          </div>
        )}

        {!loading && !proposal && (
          <div className="text-center py-8">
            <div className="text-4xl mb-2">✨</div>
            <p className="font-semibold text-gray-700">Your schedule is already optimal!</p>
            <p className="text-sm text-gray-500 mt-1">
              Everything is balanced and prioritized well.
            </p>
          </div>
        )}

        {!loading && proposal && proposal.moves && proposal.moves.length === 0 && (
          <div className="text-center py-8">
            <div className="text-4xl mb-2">✨</div>
            <p className="font-semibold text-gray-700">Your schedule is already optimal!</p>
            <p className="text-sm text-gray-500 mt-2">
              The engine couldn't find any improvements to suggest.
            </p>
          </div>
        )}

        {!loading && proposal && (
          <>
            {/* Learning Section */}
            {proposal.moves && proposal.moves.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-900 font-medium mb-1 flex items-center gap-2">
                  <span>💡</span>
                  <span>Why these changes?</span>
                </p>
                <p className="text-xs text-blue-800 leading-relaxed">
                  The schedule optimizer looks at deadlines, your energy levels, and workload balance. 
                  Hover over the badges below to learn why each change is suggested and how it helps you prioritize effectively!
                </p>
              </div>
            )}

            {/* Summary Stats */}
            {proposal.moves && proposal.moves.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-blue-50 p-2 rounded text-center">
                  <div className="text-2xl font-bold text-blue-700">{proposal.moves.length}</div>
                  <div className="text-xs text-gray-600">Changes</div>
                </div>
                <div className="bg-purple-50 p-2 rounded text-center">
                  <div className="text-2xl font-bold text-purple-700">
                    {Math.round(proposal.churnCostTotal)}
                  </div>
                  <div className="text-xs text-gray-600">Min Moved</div>
                </div>
                <div className="bg-green-50 p-2 rounded text-center">
                  <div className="text-2xl font-bold text-green-700">
                    {proposal.moves.filter(m => m.reasonCodes.some(c => c.includes('CONFLICT'))).length}
                  </div>
                  <div className="text-xs text-gray-600">Conflicts Fixed</div>
                </div>
              </div>
            )}

            {/* Proposal Info */}
            <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded text-sm">
              <p className="font-medium text-gray-900">Proposal Details</p>
              <p className="text-gray-700 mt-1">
                Trigger: {proposal.trigger}
                {proposal.energyLevel && ` • Energy: ${proposal.energyLevel}/10`}
              </p>
            </div>

            {/* Move List */}
            <div className="space-y-3">
              {proposal.moves.map((move) => (
                <div
                  key={move.id}
                  className={`p-3 border rounded cursor-pointer transition-colors ${
                    selectedMoves.has(move.id)
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  } ${
                    move.feasibilityFlags?.conflict ? "opacity-60 cursor-not-allowed" : ""
                  }`}
                  onClick={() => !move.feasibilityFlags?.conflict && toggleMove(move.id)}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedMoves.has(move.id)}
                      onChange={() => toggleMove(move.id)}
                      disabled={move.feasibilityFlags?.conflict}
                      className="mt-1"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {getStatusChip(move)}
                        <span className="text-xs text-gray-500">
                          {move.category || move.moveType}
                        </span>
                      </div>

                      {move.moveType === 'insert' ? (
                        <div className="text-sm">
                          <p className="font-medium">Add: {move.metadata?.title_hint || 'Study Session'}</p>
                          <p className="text-gray-600">
                            {formatDate(move.targetStartAt)} {formatTime(move.targetStartAt)} - {formatTime(move.targetEndAt)}
                          </p>
                        </div>
                      ) : move.moveType === 'delete' ? (
                        <div className="text-sm">
                          <p className="font-medium line-through">Remove Event</p>
                          <p className="text-gray-600">
                            {formatDate(move.metadata?.originalStartAt)} {formatTime(move.metadata?.originalStartAt)}
                          </p>
                        </div>
                      ) : (
                        <div className="text-sm">
                          <p className="font-medium">
                            {move.metadata?.title || move.metadata?.eventTitle || 'Move Event'}
                          </p>
                          <div className="flex items-center gap-2 text-gray-600 mt-1">
                            <span>{formatTime(move.metadata?.originalStartAt)}</span>
                            <ArrowRightIcon />
                            <span>{formatTime(move.targetStartAt)}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {formatDate(move.metadata?.originalStartAt)} → {formatDate(move.targetStartAt)}
                          </p>
                        </div>
                      )}

                      {/* Reason Codes - Educational */}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {move.reasonCodes.map((code, idx) => (
                          <ReasonBadge key={`${code}-${idx}`} code={code} />
                        ))}
                      </div>

                      {/* Churn Cost */}
                      <p className="text-xs text-gray-500 mt-2">
                        Churn: {move.churnCost} min
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer Actions */}
      {!loading && proposal && (
        <div className="border-t border-gray-200 p-4 space-y-2">
          {proposal.status === 'applied' ? (
            // Show Undo UI
            <div className="space-y-2">
              <div className="p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
                <p className="font-medium">Changes applied successfully!</p>
                <p className="text-xs mt-1">You can undo within 30 minutes.</p>
              </div>
              <button
                onClick={handleUndo}
                disabled={applying}
                className="w-full px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {applying ? "Undoing..." : "Undo Changes"}
              </button>
              <button
                onClick={onClose}
                className="w-full px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          ) : (
            // Show Accept/Reject UI
            <>
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                >
                  Select All
                </button>
                <button
                  onClick={deselectAll}
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
                >
                  Deselect All
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleReject}
                  disabled={applying}
                  className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                >
                  Reject All
                </button>
                <button
                  onClick={handleApply}
                  disabled={applying || selectedMoves.size === 0}
                  className="flex-1 px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {applying ? "Applying..." : `Apply These Changes (${selectedMoves.size})`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
      
      {/* Tooltip Animation Styles */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      </div>
    </>
  );
}

