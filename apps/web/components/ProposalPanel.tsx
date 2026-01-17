"use client";
import React, { useState, useEffect, useRef } from "react";
import { getReasonExplanation, type ReasonExplanation } from "../lib/reasonCodes";
import { cn } from "../lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "https://gessoapi-production.up.railway.app";

// Educational Reason Badge Component
function ReasonBadge({ code }: { code: string }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const explanation = getReasonExplanation(code);
  
  if (!explanation) {
    const readableCode = code.replace(/_/g, ' ').toLowerCase();
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-brand-surface-2 text-brand-muted font-medium">
        {readableCode}
      </span>
    );
  }
  
  return (
    <div className="relative inline-block group">
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-primary/10 text-brand-primary rounded-full text-xs font-bold hover:bg-brand-primary/20 transition-colors cursor-help"
      >
        <span>{explanation.icon}</span>
        <span>{explanation.short}</span>
      </button>
      
      <div className="absolute bottom-full left-0 mb-2 w-64 p-3 bg-brand-text text-white text-sm rounded-2xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
        <p className="font-bold mb-1">{explanation.short}</p>
        <p className="text-xs leading-relaxed opacity-90">{explanation.explanation}</p>
        <div className="absolute -bottom-1.5 left-4 w-3 h-3 bg-brand-text transform rotate-45"></div>
      </div>
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
  mode: 'propose' | 'undo';
  proposalId?: string | null;
  onProposalApplied?: () => void;
}

export function ProposalPanel({ isOpen, onClose, userId, mode, proposalId, onProposalApplied }: ProposalPanelProps) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [selectedMoves, setSelectedMoves] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (isOpen && userId) {
      if (mode === 'undo' && proposalId) {
        fetchAppliedProposal(proposalId);
      } else {
        fetchProposal();
      }
    }
  }, [isOpen, userId, mode, proposalId]);

  async function fetchAppliedProposal(id: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/rebalancing/proposals/${id}`, {
        headers: { "x-clerk-user-id": userId },
      });
      if (!res.ok) throw new Error("Failed to fetch applied proposal");
      const data = await res.json();
      if (data.ok && data.proposal) {
        setProposal(data.proposal);
        if (data.proposal.moves?.length > 0) {
          setSelectedMoves(new Set(data.proposal.moves.map((m: ProposalMove) => m.id)));
        }
      } else {
        setProposal(null);
        setSelectedMoves(new Set());
      }
    } catch (e: any) {
      setError("Failed to load undo information");
      setProposal(null);
    } finally {
      setLoading(false);
    }
  }

  async function fetchProposal() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/rebalancing/proposals`, {
        headers: { "x-clerk-user-id": userId },
      });
      if (!res.ok) throw new Error("Failed to fetch proposal");
      const data = await res.json();
      if (data.ok && data.proposal) {
        setProposal(data.proposal);
        if (data.proposal.moves?.length > 0) {
          setSelectedMoves(new Set(data.proposal.moves.map((m: ProposalMove) => m.id)));
        }
      } else {
        setProposal(null);
        setSelectedMoves(new Set());
      }
    } catch (e: any) {
      setError(e.message || "Failed to load proposal");
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!proposal || selectedMoves.size === 0) return;
    if (proposal.status !== 'proposed') {
      setError(`This proposal has been ${proposal.status}. Please generate a new proposal.`);
      await fetchProposal();
      return;
    }

    setApplying(true);
    setError("");
    try {
      const selectedMoveIds = Array.from(selectedMoves);
      const res = await fetch(`${API_BASE}/api/rebalancing/proposal/${proposal.id}/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-clerk-user-id": userId,
        },
        body: JSON.stringify({ selectedMoveIds }),
      });

      const result = await res.json();
      if (!res.ok) {
        if (result.shouldRefresh) {
          throw new Error('STALE_PROPOSAL: ' + (result.detail || result.error));
        }
        throw new Error(result.detail || result.error || "Failed to apply proposal");
      }

      if (result.ok) {
        setProposal({ ...proposal, status: 'applied' });
        onProposalApplied?.();
        onClose();
      }
    } catch (e: any) {
      setError(e.message || "Failed to apply proposal");
      if (e.message?.includes('STALE_PROPOSAL')) {
        setProposal(null);
        setSelectedMoves(new Set());
        onClose();
      }
    } finally {
      setApplying(false);
    }
  }

  async function handleUndo() {
    if (!proposal?.id) return;
    setApplying(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/rebalancing/proposal/${proposal.id}/undo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-clerk-user-id": userId,
        },
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to undo proposal");
      if (result.ok) {
        onProposalApplied?.();
        onClose();
      }
    } catch (e: any) {
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
      setProposal(null);
      setSelectedMoves(new Set());
      onProposalApplied?.();
      onClose();
    } catch (e: any) {
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

  const hasMoves = proposal?.moves && proposal.moves.length > 0;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-brand-text/30 backdrop-blur-sm z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />
      
      {/* Panel */}
      <div className="fixed right-4 top-4 bottom-4 w-[420px] max-w-[calc(100vw-2rem)] bg-brand-surface rounded-[2rem] shadow-2xl z-50 flex flex-col overflow-hidden animate-in slide-in-from-right duration-300 cozy-border">
        
        {/* Header */}
        <div className="p-6 pb-4 border-b border-brand-border/30">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-serif font-black text-brand-text tracking-tight">
                Schedule Check
              </h2>
              <p className="text-brand-muted font-medium text-sm mt-1">
                {loading ? "Analyzing..." : hasMoves ? `${proposal?.moves.length} suggestions` : "All clear!"}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-brand-surface-2 hover:bg-brand-border/30 transition-colors text-brand-muted hover:text-brand-text"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-brand-primary/10 flex items-center justify-center">
                <div className="w-8 h-8 border-3 border-brand-primary/30 border-t-brand-primary rounded-full animate-spin" />
              </div>
              <p className="font-bold text-brand-text text-lg">Scanning your schedule...</p>
              <p className="text-brand-muted text-sm mt-2">
                Checking deadlines, workload, and energy fit
              </p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-sm mb-4">
              {error}
            </div>
          )}

          {!loading && !hasMoves && (
            <div className="text-center py-12">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-brand-mint/20 flex items-center justify-center">
                <span className="text-4xl">✨</span>
              </div>
              <h3 className="font-serif font-black text-2xl text-brand-text mb-2">
                Looking good!
              </h3>
              <p className="text-brand-muted font-medium max-w-xs mx-auto">
                Your schedule is balanced and all deadlines have enough time scheduled.
              </p>
            </div>
          )}

          {!loading && hasMoves && (
            <div className="space-y-4">
              {/* Stats Cards */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-brand-primary/10 p-4 rounded-2xl text-center">
                  <div className="text-3xl font-black text-brand-primary">{proposal!.moves.length}</div>
                  <div className="text-xs font-bold text-brand-primary/70 uppercase tracking-wider">Changes</div>
                </div>
                <div className="bg-purple-100 p-4 rounded-2xl text-center">
                  <div className="text-3xl font-black text-purple-600">{Math.round(proposal!.churnCostTotal)}</div>
                  <div className="text-xs font-bold text-purple-600/70 uppercase tracking-wider">Minutes</div>
                </div>
                <div className="bg-brand-mint/20 p-4 rounded-2xl text-center">
                  <div className="text-3xl font-black text-brand-mint">
                    {proposal!.moves.filter(m => m.reasonCodes.some(c => c.includes('CONFLICT') || c.includes('OVERLAP'))).length}
                  </div>
                  <div className="text-xs font-bold text-brand-mint/70 uppercase tracking-wider">Fixes</div>
                </div>
              </div>

              {/* Move List */}
              <div className="space-y-3">
                {proposal!.moves.map((move) => (
                  <div
                    key={move.id}
                    onClick={() => !move.feasibilityFlags?.conflict && toggleMove(move.id)}
                    className={cn(
                      "p-4 rounded-2xl cursor-pointer transition-all border-2",
                      selectedMoves.has(move.id)
                        ? "border-brand-primary bg-brand-primary/5 shadow-md"
                        : "border-transparent bg-brand-surface-2 hover:border-brand-border",
                      move.feasibilityFlags?.conflict && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 border-2 transition-colors",
                        selectedMoves.has(move.id)
                          ? "bg-brand-primary border-brand-primary"
                          : "border-brand-border bg-white"
                      )}>
                        {selectedMoves.has(move.id) && (
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        {/* Move Type Badge */}
                        <div className="flex items-center gap-2 mb-2">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                            move.moveType === 'insert' ? "bg-blue-100 text-blue-700" :
                            move.moveType === 'delete' ? "bg-rose-100 text-rose-700" :
                            "bg-amber-100 text-amber-700"
                          )}>
                            {move.moveType === 'insert' ? 'Add' : move.moveType === 'delete' ? 'Remove' : 'Move'}
                          </span>
                        </div>

                        {/* Event Title */}
                        <p className="font-bold text-brand-text text-sm leading-tight mb-1">
                          {move.metadata?.title || move.metadata?.eventTitle || 'Schedule Change'}
                        </p>

                        {/* Time Change */}
                        {move.moveType !== 'delete' && (
                          <div className="text-brand-muted text-xs font-medium">
                            {move.moveType === 'insert' ? (
                              <span>{formatDate(move.targetStartAt)} at {formatTime(move.targetStartAt)}</span>
                            ) : (
                              <span className="flex items-center gap-1.5">
                                <span>{formatTime(move.metadata?.originalStartAt)}</span>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                                <span className="text-brand-primary font-bold">{formatTime(move.targetStartAt)}</span>
                              </span>
                            )}
                          </div>
                        )}

                        {/* Reason Tags */}
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {move.reasonCodes.slice(0, 2).map((code, idx) => (
                            <ReasonBadge key={`${code}-${idx}`} code={code} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {!loading && hasMoves && (
          <div className="p-6 pt-4 border-t border-brand-border/30 bg-brand-surface">
            {proposal?.status === 'applied' ? (
              <div className="space-y-3">
                <div className="p-4 bg-brand-mint/10 border border-brand-mint/30 rounded-2xl text-center">
                  <p className="font-bold text-brand-mint">Changes applied!</p>
                  <p className="text-xs text-brand-muted mt-1">You can undo within 30 minutes</p>
                </div>
                <button
                  onClick={handleUndo}
                  disabled={applying}
                  className="w-full py-3.5 px-6 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-full transition-colors disabled:opacity-50 text-sm"
                >
                  {applying ? "Undoing..." : "Undo All Changes"}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={handleApply}
                  disabled={applying || selectedMoves.size === 0}
                  className="w-full py-4 px-6 bg-brand-primary hover:brightness-110 text-white font-black rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg text-base"
                >
                  {applying ? "Applying..." : `Apply ${selectedMoves.size} Change${selectedMoves.size === 1 ? '' : 's'}`}
                </button>
                <button
                  onClick={handleReject}
                  disabled={applying}
                  className="w-full py-3 px-6 bg-brand-surface-2 hover:bg-brand-border/30 text-brand-muted font-bold rounded-full transition-colors disabled:opacity-50 text-sm"
                >
                  Not Now
                </button>
              </div>
            )}
          </div>
        )}

        {/* Close button for empty state */}
        {!loading && !hasMoves && (
          <div className="p-6 pt-4 border-t border-brand-border/30">
            <button
              onClick={onClose}
              className="w-full py-3.5 px-6 bg-brand-surface-2 hover:bg-brand-border/30 text-brand-text font-bold rounded-full transition-colors text-sm"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </>
  );
}
