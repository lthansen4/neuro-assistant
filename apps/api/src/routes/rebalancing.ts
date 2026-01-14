import { Hono } from 'hono';
import { HeuristicEngine } from '../lib/heuristic-engine';
import { db } from '../lib/db';
import { rebalancingProposals, proposalMoves, calendarEventsNew, users, churnLedger } from '../../../../packages/db/src/schema';
import { eq, and, sql, gte } from 'drizzle-orm';

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
async function getUserId(c: any): Promise<string | null> {
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

/**
 * POST /api/rebalancing/propose
 * 
 * Generate a new rebalancing proposal (alias for /optimize for backward compatibility)
 */
rebalancingRoute.post('/propose', async (c) => {
  // #region agent log
  fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rebalancing.ts:PROPOSE_ENTRY',message:'Propose endpoint hit',data:{hasUserId:!!c.req.header('x-clerk-user-id')},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,D',runId:'post-fix'})}).catch(()=>{});
  // #endregion
  try {
    const userId = await getUserId(c);
    if (!userId) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rebalancing.ts:PROPOSE_NOAUTH',message:'No userId found',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A',runId:'post-fix'})}).catch(()=>{});
      // #endregion
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const energyLevel = body.energyLevel || 5;
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rebalancing.ts:PROPOSE_PARSED',message:'Request parsed with DB userId',data:{userId:userId.substring(0,8),energyLevel},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B',runId:'post-fix'})}).catch(()=>{});
    // #endregion

    console.log(`[RebalancingAPI] Proposal requested by user ${userId}`);

    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rebalancing.ts:PROPOSE_BEFORE_ENGINE',message:'Before creating engine',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B',runId:'post-fix'})}).catch(()=>{});
    // #endregion
    const engine = new HeuristicEngine(userId);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rebalancing.ts:PROPOSE_AFTER_ENGINE',message:'Engine created',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B',runId:'post-fix'})}).catch(()=>{});
    // #endregion
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rebalancing.ts:PROPOSE_BEFORE_GENERATE',message:'Before generate proposal',data:{},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C',runId:'post-fix'})}).catch(()=>{});
    // #endregion
    const result = await engine.generateComprehensiveProposal({
      userId,
      energyLevel,
      type: 'manual',
      lookaheadDays: 14
    });
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rebalancing.ts:PROPOSE_AFTER_GENERATE',message:'Proposal generated',data:{proposalId:result.proposalId.substring(0,8),movesCount:result.moves.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C',runId:'post-fix'})}).catch(()=>{});
    // #endregion

    return c.json({
      ok: true,
      proposal_id: result.proposalId,
      moves_count: result.moves.length,
      message: result.moves.length > 0 
        ? `Generated ${result.moves.length} optimization moves`
        : 'Your schedule is already optimal!'
    });

  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'rebalancing.ts:PROPOSE_ERROR',message:'Error in propose',data:{error:error instanceof Error?error.message:String(error),stack:error instanceof Error?error.stack?.substring(0,200):undefined},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,B,C',runId:'post-fix'})}).catch(()=>{});
    // #endregion
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
      message: result.moves.length > 0 
        ? `Generated ${result.moves.length} optimization moves`
        : 'Your schedule is already optimal!'
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
 * Accept and apply a proposal
 */
rebalancingRoute.post('/proposal/:id/accept', async (c) => {
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
        eq(rebalancingProposals.userId, userId),
        eq(rebalancingProposals.status, 'proposed')
      )
    });

    if (!proposal) {
      return c.json({ error: 'Proposal not found or already processed' }, 404);
    }

    // Fetch moves
    const moves = await db.query.proposalMoves.findMany({
      where: eq(proposalMoves.proposalId, proposalId)
    });

    console.log(`[RebalancingAPI] Applying ${moves.length} moves from proposal ${proposalId}`);

    // Apply moves in a transaction
    let appliedCount = 0;
    
    for (const move of moves) {
      try {
        if (move.moveType === 'insert' && move.targetStartAt && move.targetEndAt) {
          // Create new event
          const metadata = move.metadata as any;
          await db.insert(calendarEventsNew).values({
            userId,
            title: metadata?.eventTitle || metadata?.title || 'Focus Session',
            eventType: 'Focus',
            startAt: move.targetStartAt,
            endAt: move.targetEndAt,
            isMovable: true,
            linkedAssignmentId: metadata?.assignmentId || null,
            metadata: move.metadata || null
          });
          appliedCount++;
        } else if (move.moveType === 'move' && move.sourceEventId && move.targetStartAt && move.targetEndAt) {
          // Move existing event
          await db
            .update(calendarEventsNew)
            .set({
              startAt: move.targetStartAt,
              endAt: move.targetEndAt,
              updatedAt: new Date()
            })
            .where(
              and(
                eq(calendarEventsNew.id, move.sourceEventId),
                eq(calendarEventsNew.userId, userId)
              )
            );
          appliedCount++;
        } else if (move.moveType === 'delete' && move.sourceEventId) {
          // Delete event
          await db
            .delete(calendarEventsNew)
            .where(
              and(
                eq(calendarEventsNew.id, move.sourceEventId),
                eq(calendarEventsNew.userId, userId)
              )
            );
          appliedCount++;
        }
      } catch (error) {
        console.error(`[RebalancingAPI] Failed to apply move ${move.id}:`, error);
      }
    }

    // Update proposal status
    await db
      .update(rebalancingProposals)
      .set({
        status: 'applied',
        appliedAt: new Date()
      })
      .where(eq(rebalancingProposals.id, proposalId));

    console.log(`[RebalancingAPI] Applied ${appliedCount}/${moves.length} moves`);

    return c.json({
      ok: true,
      applied: appliedCount,
      total: moves.length,
      message: `Successfully applied ${appliedCount} optimization moves`
    });

  } catch (error) {
    console.error('[RebalancingAPI] Accept proposal error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Failed to apply proposal' 
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

    // Update proposal status
    const result = await db
      .update(rebalancingProposals)
      .set({
        status: 'rejected',
        rejectedAt: new Date()
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
 * Undo an applied proposal by reverting all moves back to original state
 */
rebalancingRoute.post('/proposal/:id/undo', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const proposalId = c.req.param('id');

    // Fetch the applied proposal
    const proposal = await db.query.rebalancingProposals.findFirst({
      where: and(
        eq(rebalancingProposals.id, proposalId),
        eq(rebalancingProposals.userId, userId),
        eq(rebalancingProposals.status, 'applied')
      )
    });

    if (!proposal || !proposal.appliedAt) {
      return c.json({ error: 'Proposal not found or not applied' }, 404);
    }

    // Check if undo window has expired (24 hours)
    const hoursElapsed = (Date.now() - proposal.appliedAt.getTime()) / (1000 * 60 * 60);
    if (hoursElapsed > 24) {
      return c.json({ error: 'Undo window expired (24 hours)' }, 400);
    }

    // Fetch all moves for this proposal
    const moves = await db.query.proposalMoves.findMany({
      where: eq(proposalMoves.proposalId, proposalId)
    });

    console.log(`[RebalancingAPI] Undoing ${moves.length} moves from proposal ${proposalId}`);

    // Revert moves in reverse order
    let undoneCount = 0;
    
    for (const move of moves.reverse()) {
      try {
        if (move.moveType === 'insert' && move.sourceEventId) {
          // Delete inserted event
          await db
            .delete(calendarEventsNew)
            .where(
              and(
                eq(calendarEventsNew.id, move.sourceEventId),
                eq(calendarEventsNew.userId, userId)
              )
            );
          undoneCount++;
        } else if (move.moveType === 'move' && move.sourceEventId) {
          // Revert moved event to original time
          const metadata = move.metadata as any;
          if (metadata?.originalStartAt && metadata?.originalEndAt) {
            await db
              .update(calendarEventsNew)
              .set({
                startAt: new Date(metadata.originalStartAt),
                endAt: new Date(metadata.originalEndAt),
                updatedAt: new Date()
              })
              .where(
                and(
                  eq(calendarEventsNew.id, move.sourceEventId),
                  eq(calendarEventsNew.userId, userId)
                )
              );
            undoneCount++;
          }
        } else if (move.moveType === 'delete' && move.sourceEventId) {
          // Restore deleted event
          const metadata = move.metadata as any;
          if (metadata?.originalStartAt && metadata?.originalEndAt) {
            await db.insert(calendarEventsNew).values({
              id: move.sourceEventId,
              userId,
              title: metadata.eventTitle || metadata.title || 'Restored Event',
              eventType: metadata.eventType || 'Focus',
              startAt: new Date(metadata.originalStartAt),
              endAt: new Date(metadata.originalEndAt),
              isMovable: true,
              metadata: move.metadata
            });
            undoneCount++;
          }
          undoneCount++;
        }
      } catch (moveError) {
        console.error(`[RebalancingAPI] Error undoing move ${move.id}:`, moveError);
      }
    }

    // Mark proposal as reverted
    await db
      .update(rebalancingProposals)
      .set({ status: 'reverted' })
      .where(eq(rebalancingProposals.id, proposalId));

    console.log(`[RebalancingAPI] Successfully undid ${undoneCount}/${moves.length} moves`);

    return c.json({
      ok: true,
      message: `Undid ${undoneCount} changes`,
      undoneCount,
      totalMoves: moves.length
    });

  } catch (error) {
    console.error('[RebalancingAPI] Undo proposal error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Failed to undo proposal' 
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
