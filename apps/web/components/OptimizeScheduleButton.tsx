"use client";

import { useState } from "react";
import { Button } from "./ui/button";
import { Sparkles, Loader2 } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || "https://gessoapi-production.up.railway.app";

interface OptimizeScheduleButtonProps {
  userId: string;
  energyLevel?: number;
  onOptimizationComplete?: (proposalId: string | null, movesCount: number) => void;
}

export function OptimizeScheduleButton({
  userId,
  energyLevel = 5,
  onOptimizationComplete
}: OptimizeScheduleButtonProps) {
  const [isOptimizing, setIsOptimizing] = useState(false);

  const handleOptimize = async () => {
    setIsOptimizing(true);

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

      // Always call onOptimizationComplete to open the ProposalPanel
      if (onOptimizationComplete) {
        onOptimizationComplete(data.proposal_id ?? null, data.moves_count);
      }

      // If there are moves, show the proposal
      if (data.moves_count > 0) {
        // Trigger a calendar refresh
        window.dispatchEvent(new Event('refreshCalendar'));
      }

    } catch (err) {
      console.error('[OptimizeButton] Optimization error:', err);
    } finally {
      setIsOptimizing(false);
    }
  };

  return (
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
  );
}

