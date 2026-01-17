"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "https://gessoapi-production.up.railway.app";

interface OptimizeScheduleButtonProps {
  userId: string;
  energyLevel?: number;
  onOptimizationComplete?: (proposalId: string, movesCount: number) => void;
}

export function OptimizeScheduleButton({
  userId,
  energyLevel = 5,
  onOptimizationComplete
}: OptimizeScheduleButtonProps) {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleOptimize = async () => {
    setIsOptimizing(true);
    setError(null);

    try {
      console.log('[OptimizeButton] Triggering optimization...');
      
      const response = await fetch(`${API_BASE}/api/rebalancing/optimize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-clerk-user-id': userId
        },
        body: JSON.stringify({
          energy_level: energyLevel,
          lookahead_days: 14
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to optimize schedule');
      }

      const data = await response.json();
      console.log('[OptimizeButton] Optimization result:', data);

      // Close our simple result sheet
      setShowResult(false);

      // Always call onOptimizationComplete to open the ProposalPanel
      if (onOptimizationComplete && data.proposal_id) {
        onOptimizationComplete(data.proposal_id, data.moves_count);
      }

      // If there are moves, show the proposal
      if (data.moves_count > 0) {
        // Trigger a calendar refresh
        window.dispatchEvent(new Event('refreshCalendar'));
      } else {
        // Show simple "already optimal" message
        setResult(data);
        setShowResult(true);
      }

    } catch (err) {
      console.error('[OptimizeButton] Optimization error:', err);
      setError(err instanceof Error ? err.message : 'Failed to optimize schedule');
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
    <>
      <Button
        onClick={handleOptimize}
        disabled={isOptimizing}
        variant="outline"
        className="gap-2 h-9 px-3 text-sm"
      >
        {isOptimizing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Optimizing...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Optimize Schedule
          </>
        )}
      </Button>

      <Sheet open={showResult} onOpenChange={setShowResult}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-500" />
              Optimization Results
            </SheetTitle>
            <SheetDescription>
              Review your schedule optimization suggestions
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-4">
            {error ? (
              <div className="p-4 bg-red-50 dark:bg-red-900/30 border-2 border-red-400 dark:border-red-600 rounded-lg">
                <p className="text-sm font-semibold text-red-900 dark:text-red-100">
                  Optimization Failed
                </p>
                <p className="text-sm text-red-800 dark:text-red-200 mt-1">
                  {error}
                </p>
              </div>
            ) : result ? (
              <>
                {result.moves_count > 0 ? (
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-400 dark:border-blue-600 rounded-lg">
                    <div className="flex items-start gap-3">
                      <Sparkles className="h-5 w-5 text-blue-600 dark:text-blue-300 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                          {result.moves_count} Optimization{result.moves_count === 1 ? '' : 's'} Found!
                        </p>
                        <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                          {result.message}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-green-50 dark:bg-green-900/30 border-2 border-green-400 dark:border-green-600 rounded-lg">
                    <div className="flex items-start gap-3">
                      <Sparkles className="h-5 w-5 text-green-600 dark:text-green-300 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-green-900 dark:text-green-100">
                          Already Optimal!
                        </p>
                        <p className="text-sm text-green-800 dark:text-green-200 mt-1">
                          Your schedule is already well-balanced. No changes needed!
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {result.moves_count > 0 && result.proposal_id && (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      View the full proposal to see what changes are suggested and accept or reject them.
                    </p>
                    
                    <Button
                      onClick={() => {
                        // Navigate to proposal view or open proposal preview
                        window.location.href = `/dashboard?proposal=${result.proposal_id}`;
                      }}
                      className="w-full"
                    >
                      View Proposal Details
                    </Button>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

