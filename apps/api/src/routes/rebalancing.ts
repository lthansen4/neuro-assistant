import { Hono } from 'hono';
import { HeuristicEngine } from '../lib/heuristic-engine';
import { RebalancingService } from '../lib/rebalancing-service';
import { checkAlerts } from '../lib/alert-engine';
import { db } from '../lib/db';
import { rebalancingProposals, proposalMoves, calendarEventsNew, users, churnLedger } from '../../../../packages/db/src/schema';
import { eq, and, sql, gte } from 'drizzle-orm';
import { formatInTimezone, getUserTimezone } from '../lib/timezone-utils';

/**
 * Rebalancing Routes
 * 
 * Endpoints for comprehensive calendar optimization:
 * - Manual optimization trigger
 * - Proposal retrieval
 * - Proposal acceptance/rejection
 */

const rebalancingRoute = new Hono();

/**
 * Helper to convert Clerk user ID to database UUID
 */
async function getUserIdFromContext(c: any): Promise<string | null> {
  const clerkUserId = c.req.header('x-clerk-user-id');
  if (!clerkUserId) {
    console.error('[Rebalancing API] Missing x-clerk-user-id header');
    return null;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId)
  });

  if (!user) {
    console.error('[Rebalancing API] User not found for Clerk ID:', clerkUserId);
    return null;
  }

  return user.id;
}

// Alias for backward compatibility
const getUserId = getUserIdFromContext;

/**
 * GET /api/rebalancing/alerts
 * 
 * Check for genuine problems that need attention.
 * This is the "smoke detector" - only alerts when there's a real issue.
 */
rebalancingRoute.get('/alerts', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    console.log(`[RebalancingAPI] Checking alerts for user ${userId.substring(0, 8)}...`);
    
    const result = await checkAlerts(userId);
    
    return c.json({
      ok: true,
      hasAlerts: result.hasAlerts,
      criticalCount: result.criticalCount,
      highCount: result.highCount,
      totalCount: result.totalCount,
      alerts: result.alerts,
      checkedAt: result.checkedAt.toISOString()
    });

  } catch (error) {
    console.error('[RebalancingAPI] Alert check error:', error);
    return c.json({ 
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to check alerts' 
    }, 500);
  }
});

/**
 * POST /api/rebalancing/propose
 * 
 * Generate a new rebalancing proposal (alias for /optimize for backward compatibility)
 */
rebalancingRoute.post('/propose', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const energyLevel = body.energyLevel || 5;

    console.log(`[RebalancingAPI] Proposal requested by user ${userId}`);

    const engine = new HeuristicEngine(userId);
    const result = await engine.generateComprehensiveProposal({
      userId,
      energyLevel,
      type: 'manual',
      lookaheadDays: 14
    });

    return c.json({
      ok: true,
      proposal_id: result.proposalId,
      moves_count: result.moves.length,
      message: result.message || (result.moves.length > 0 
        ? `Found ${result.moves.length} things to address`
        : 'Your schedule looks good! No changes needed.')
    });

  } catch (error) {
    console.error('[RebalancingAPI] Proposal generation error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Failed to generate proposal' 
    }, 500);
  }
});

/**
 * GET /api/rebalancing/proposals
 * 
 * Get the most recent proposed (not yet applied) proposal for the user
 */
rebalancingRoute.get('/proposals', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Get the most recent proposed proposal
    const proposal = await db.query.rebalancingProposals.findFirst({
      where: and(
        eq(rebalancingProposals.userId, userId),
        eq(rebalancingProposals.status, 'proposed')
      ),
      orderBy: [sql`${rebalancingProposals.createdAt} DESC`]
    });

    if (!proposal) {
      return c.json({ ok: true, proposal: null });
    }

    // Fetch moves for this proposal
    const moves = await db
      .select()
      .from(proposalMoves)
      .where(eq(proposalMoves.proposalId, proposal.id));

    return c.json({
      ok: true,
      proposal: {
        ...proposal,
        moves
      }
    });

  } catch (error) {
    console.error('[RebalancingAPI] Get proposals error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch proposals' 
    }, 500);
  }
});

/**
 * GET /api/rebalancing/applied
 * 
 * Get the most recently applied proposal (for undo functionality)
 */
rebalancingRoute.get('/applied', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // Get the most recent applied proposal
    const proposal = await db.query.rebalancingProposals.findFirst({
      where: and(
        eq(rebalancingProposals.userId, userId),
        eq(rebalancingProposals.status, 'applied')
      ),
      orderBy: [sql`${rebalancingProposals.appliedAt} DESC`]
    });

    if (!proposal || !proposal.appliedAt) {
      return c.json({ ok: true, proposal: null });
    }

    // Fetch moves for this proposal
    const moves = await db
      .select()
      .from(proposalMoves)
      .where(eq(proposalMoves.proposalId, proposal.id));

    // Calculate time remaining for undo (24 hours window)
    const now = new Date();
    const appliedTime = new Date(proposal.appliedAt);
    const timeElapsedMinutes = Math.floor((now.getTime() - appliedTime.getTime()) / (1000 * 60));
    const timeRemainingMinutes = Math.max(0, 1440 - timeElapsedMinutes); // 24 hours = 1440 minutes

    if (timeRemainingMinutes === 0) {
      return c.json({ ok: true, proposal: null });
    }

    return c.json({
      ok: true,
      proposal: {
        ...proposal,
        moves,
        timeRemainingMinutes
      }
    });

  } catch (error) {
    console.error('[RebalancingAPI] Get applied proposal error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch applied proposal' 
    }, 500);
  }
});

/**
 * POST /api/rebalancing/optimize
 * 
 * Manually trigger comprehensive calendar optimization
 */
rebalancingRoute.post('/optimize', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const energyLevel = body.energy_level || 5;
    const lookaheadDays = body.lookahead_days || 14;

    console.log(`[RebalancingAPI] Manual optimization requested by user ${userId}`);

    const engine = new HeuristicEngine(userId);
    const result = await engine.generateComprehensiveProposal({
      userId,
      energyLevel,
      type: 'manual',
      lookaheadDays
    });

    return c.json({
      ok: true,
      proposal_id: result.proposalId,
      moves_count: result.moves.length,
      message: result.message || (result.moves.length > 0 
        ? `Found ${result.moves.length} things to address`
        : 'Your schedule looks good! No changes needed.')
    });

  } catch (error) {
    console.error('[RebalancingAPI] Optimization error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Failed to generate optimization' 
    }, 500);
  }
});

/**
 * GET /api/rebalancing/proposal/:id
 * 
 * Get details of a specific proposal
 */
rebalancingRoute.get('/proposal/:id', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const proposalId = c.req.param('id');

    // Fetch proposal
    const proposal = await db.query.rebalancingProposals.findFirst({
      where: and(
        eq(rebalancingProposals.id, proposalId),
        eq(rebalancingProposals.userId, userId)
      )
    });

    if (!proposal) {
      return c.json({ error: 'Proposal not found' }, 404);
    }

    // Fetch moves
    const moves = await db.query.proposalMoves.findMany({
      where: eq(proposalMoves.proposalId, proposalId)
    });

    // Categorize moves
    const categorized = {
      conflicts: moves.filter(m => m.category === 'conflict_resolution'),
      cramming: moves.filter(m => (m.reasonCodes as any)?.some((r: string) => r.includes('CRAMMING'))),
      energy: moves.filter(m => (m.reasonCodes as any)?.some((r: string) => r.includes('ENERGY'))),
      balance: moves.filter(m => (m.reasonCodes as any)?.some((r: string) => r.includes('WORKLOAD'))),
      other: moves.filter(m => 
        !(m.reasonCodes as any)?.some((r: string) => 
          r.includes('CRAMMING') || r.includes('ENERGY') || r.includes('WORKLOAD') || r.includes('CONFLICT')
        )
      )
    };

    return c.json({
      ok: true,
      proposal: {
        id: proposal.id,
        status: proposal.status,
        trigger: proposal.trigger,
        energyLevel: proposal.energyLevel,
        movesCount: proposal.movesCount,
        churnCostTotal: proposal.churnCostTotal,
        createdAt: proposal.createdAt
      },
      moves: categorized,
      stats: {
        total: moves.length,
        conflicts: categorized.conflicts.length,
        cramming: categorized.cramming.length,
        energy: categorized.energy.length,
        balance: categorized.balance.length,
        other: categorized.other.length
      }
    });

  } catch (error) {
    console.error('[RebalancingAPI] Get proposal error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch proposal' 
    }, 500);
  }
});

/**
 * POST /api/rebalancing/proposal/:id/accept
 * 
 * Accept and apply a proposal using the RebalancingService for proper
 * snapshot creation and validation.
 */
rebalancingRoute.post('/proposal/:id/accept', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const proposalId = c.req.param('id');
    
    // Get selected move IDs from request body (optional)
    let selectedMoveIds: string[] | undefined;
    try {
      const body = await c.req.json();
      selectedMoveIds = body.selectedMoveIds;
    } catch {
      // No body is fine - apply all moves
    }

    console.log(`[RebalancingAPI] Applying proposal ${proposalId} for user ${userId}`);
    if (selectedMoveIds) {
      console.log(`[RebalancingAPI] Applying ${selectedMoveIds.length} selected moves`);
    }

    // Use the RebalancingService for proper apply with snapshot
    const rebalancingService = new RebalancingService();
    const result = await rebalancingService.applyProposal(proposalId, userId, selectedMoveIds);

    console.log(`[RebalancingAPI] ═══════════════════════════════════════════`);
    console.log(`[RebalancingAPI] PROPOSAL APPLIED SUCCESSFULLY`);
    console.log(`[RebalancingAPI]   Status: ${result.status}`);
    console.log(`[RebalancingAPI]   Applied: ${result.applied}`);
    console.log(`[RebalancingAPI]   Skipped: ${result.skipped || 0}`);
    console.log(`[RebalancingAPI]   Cached: ${result.cached || false}`);
    console.log(`[RebalancingAPI] ═══════════════════════════════════════════`);

    // Get user timezone for friendly time formatting in response
    const userTimezone = await getUserTimezone(userId);

    return c.json({
      ok: true,
      applied: result.applied,
      skipped: result.skipped || 0,
      status: result.status,
      cached: result.cached || false,
      message: result.cached 
        ? 'Proposal was already applied (idempotent)'
        : `Successfully applied ${result.applied} optimization move${result.applied === 1 ? '' : 's'}`,
      conflicts: result.conflicts
    });

  } catch (error) {
    console.error('[RebalancingAPI] Accept proposal error:', error);
    
    // Handle specific error types
    const errorMessage = error instanceof Error ? error.message : 'Failed to apply proposal';
    
    if (errorMessage.includes('APPLY_UNAVAILABLE')) {
      return c.json({ 
        ok: false,
        error: 'Proposal not available',
        detail: errorMessage
      }, 404);
    }
    
    if (errorMessage.includes('STALE_PROPOSAL')) {
      return c.json({ 
        ok: false,
        error: 'Proposal is stale - some events have changed since the proposal was generated',
        detail: errorMessage,
        shouldRefresh: true
      }, 409);
    }
    
    if (errorMessage.includes('VALIDATION_FAILED')) {
      return c.json({ 
        ok: false,
        error: 'Proposal failed validation',
        detail: errorMessage
      }, 400);
    }

    return c.json({ 
      ok: false,
      error: errorMessage 
    }, 500);
  }
});

/**
 * POST /api/rebalancing/proposal/:id/reject
 * 
 * Reject a proposal
 */
rebalancingRoute.post('/proposal/:id/reject', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const proposalId = c.req.param('id');

    // Update proposal status (use 'cancelled' - 'rejected' is not in DB constraint)
    const result = await db
      .update(rebalancingProposals)
      .set({
        status: 'cancelled'
      })
      .where(
        and(
          eq(rebalancingProposals.id, proposalId),
          eq(rebalancingProposals.userId, userId),
          eq(rebalancingProposals.status, 'proposed')
        )
      )
      .returning();

    if (result.length === 0) {
      return c.json({ error: 'Proposal not found or already processed' }, 404);
    }

    console.log(`[RebalancingAPI] Proposal ${proposalId} rejected by user`);

    return c.json({
      ok: true,
      message: 'Proposal rejected'
    });

  } catch (error) {
    console.error('[RebalancingAPI] Reject proposal error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Failed to reject proposal' 
    }, 500);
  }
});

/**
 * POST /api/rebalancing/proposal/:id/undo
 * 
 * Undo an applied proposal using the RebalancingService which properly
 * uses the rollback snapshot for accurate restoration.
 */
rebalancingRoute.post('/proposal/:id/undo', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const proposalId = c.req.param('id');

    console.log(`[RebalancingAPI] Undo requested for proposal ${proposalId}`);

    // Use the RebalancingService for proper undo using snapshot
    const rebalancingService = new RebalancingService();
    const result = await rebalancingService.undoProposal(proposalId, userId);

    console.log(`[RebalancingAPI] Undo result: ${result.restoredCount} events restored`);

    return c.json({
      ok: true,
      message: `Successfully reverted ${result.restoredCount} change${result.restoredCount === 1 ? '' : 's'}`,
      restoredCount: result.restoredCount,
      status: result.status
    });

  } catch (error) {
    console.error('[RebalancingAPI] Undo proposal error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Failed to undo proposal';
    
    if (errorMessage.includes('UNDO_UNAVAILABLE')) {
      return c.json({ 
        ok: false,
        error: 'Cannot undo this proposal',
        detail: errorMessage
      }, 400);
    }
    
    if (errorMessage.includes('UNDO_FAILED')) {
      return c.json({ 
        ok: false,
        error: 'Failed to restore events',
        detail: errorMessage
      }, 500);
    }

    return c.json({ 
      ok: false,
      error: errorMessage 
    }, 500);
  }
});

/**
 * GET /api/rebalancing/limits
 * 
 * Get current churn limits and usage
 */
rebalancingRoute.get('/limits', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { churnLedger } = await import('../../../../packages/db/src/schema');
    
    // Get today's churn
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);

    const todayDate = todayStart.toISOString().split('T')[0]; // YYYY-MM-DD
    const todayChurn = await db.query.churnLedger.findFirst({
      where: and(
        eq(churnLedger.userId, userId),
        eq(churnLedger.day, todayDate)
      )
    });

    const usedMoves = todayChurn?.movesCount || 0;
    const usedMinutes = todayChurn?.minutesMoved || 0;

    const dailyMaxMoves = 5;
    const dailyMaxMinutes = 180;

    return c.json({
      ok: true,
      daily_cap: {
        max_moves: dailyMaxMoves,
        max_minutes: dailyMaxMinutes
      },
      used_today: {
        moves: usedMoves,
        minutes: usedMinutes
      },
      remaining: {
        moves: Math.max(0, dailyMaxMoves - usedMoves),
        minutes: Math.max(0, dailyMaxMinutes - usedMinutes)
      }
    });

  } catch (error) {
    console.error('[RebalancingAPI] Get limits error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Failed to fetch limits' 
    }, 500);
  }
});

export default rebalancingRoute;
