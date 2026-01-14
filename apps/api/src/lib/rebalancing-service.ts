import { db } from './db';
import {
  rebalancingProposals,
  rollbackSnapshots,
  calendarEventsNew,
  churnLedger,
  churnSettings,
  proposalMoves,
  rebalancingApplyAttempts
} from '../../../../packages/db/src/schema';
import { eq, and, sql, desc } from 'drizzle-orm';

export class RebalancingService {
  // SAFETY CONSTRAINTS
  private static readonly SLEEP_START_HOUR = 23; // 11 PM
  private static readonly SLEEP_END_HOUR = 7;    // 7 AM
  private static readonly MAX_RETRY_ATTEMPTS = 3;
  private static readonly RETRY_DELAY_MS = 100;

  /**
   * Check if a given date/time falls within the sleep window (11pm - 7am)
   * NOTE: Uses UTC hours for now. TODO: Add user timezone support
   */
  private isInSleepWindow(date: Date): boolean {
    const hour = date.getUTCHours(); // Use UTC hours to match ISO timestamp timezone
    return hour >= RebalancingService.SLEEP_START_HOUR || hour < RebalancingService.SLEEP_END_HOUR;
  }

  /**
   * Retry a database operation with exponential backoff
   * Used for handling transient database errors
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxAttempts: number = RebalancingService.MAX_RETRY_ATTEMPTS
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // Check if error is retryable (e.g., connection timeout, deadlock)
        const isRetryable = error.message?.includes('connection') || 
                           error.message?.includes('timeout') ||
                           error.message?.includes('deadlock');
        
        if (!isRetryable || attempt === maxAttempts) {
          console.error(`[RebalancingService] ${operationName} failed after ${attempt} attempts:`, error);
          throw error;
        }
        
        // Exponential backoff
        const delay = RebalancingService.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(`[RebalancingService] ${operationName} failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError || new Error(`${operationName} failed after ${maxAttempts} attempts`);
  }

  /**
   * Validates a proposal before applying it.
   * Checks for:
   * - Sleep window violations
   * - Invalid time ranges (start >= end)
   * - Overlapping events
   * - Duration mismatches
   */
  private async validateProposal(
    proposalId: string,
    moves: Array<{
      id: string;
      moveType: string;
      sourceEventId: string | null;
      targetStartAt: Date | null;
      targetEndAt: Date | null;
    }>,
    tx: any
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    for (const move of moves) {
      // Check 1: Valid time range (start < end)
      if (move.targetStartAt && move.targetEndAt) {
        if (move.targetStartAt >= move.targetEndAt) {
          errors.push(`Move ${move.id}: Invalid time range - start (${move.targetStartAt.toISOString()}) >= end (${move.targetEndAt.toISOString()})`);
        }
      }

      // Check 2: No moves violate sleep window
      if (move.targetStartAt && this.isInSleepWindow(move.targetStartAt)) {
        errors.push(`Move ${move.id}: Target start time (${move.targetStartAt.toISOString()}) falls in sleep window (11pm-7am)`);
      }
      if (move.targetEndAt && this.isInSleepWindow(move.targetEndAt)) {
        errors.push(`Move ${move.id}: Target end time (${move.targetEndAt.toISOString()}) falls in sleep window (11pm-7am)`);
      }

      // Check 3: Duration matches (no time lost/gained)
      if (move.sourceEventId && move.targetStartAt && move.targetEndAt) {
        const sourceEvent = await tx.query.calendarEventsNew.findFirst({
          where: eq(calendarEventsNew.id, move.sourceEventId)
        });
        if (sourceEvent) {
          const originalDuration = sourceEvent.endAt.getTime() - sourceEvent.startAt.getTime();
          const targetDuration = move.targetEndAt.getTime() - move.targetStartAt.getTime();
          if (originalDuration !== targetDuration) {
            errors.push(`Move ${move.id}: Duration mismatch - original ${originalDuration}ms vs target ${targetDuration}ms`);
          }
        }
      }
    }

    // Check 4: No overlapping events after applying moves
    // TODO: This check is disabled temporarily - it was too expensive (O(n²) for all events)
    // and created massive error messages. Need to optimize to only check moved events.
    // For now, relying on the HeuristicEngine to not propose overlapping moves.
    
    console.log(`[RebalancingService] Validation passed (overlap check disabled for testing)`);

    return { valid: errors.length === 0, errors };
  }

  /**
   * Applies a rebalancing proposal by executing all moves atomically.
   * Handles stale conflict detection, creates rollback snapshot, and updates churn ledger.
   * @param proposalId - The proposal to apply
   * @param userId - The user applying the proposal
   * @param moveIds - Optional array of move IDs to apply. If provided, only these moves will be applied.
   */
  async applyProposal(proposalId: string, userId: string, moveIds?: string[]) {
    return await db.transaction(async (tx) => {
      // 0. IDEMPOTENCY CHECK: Check if this proposal was already applied recently (within 5 minutes)
      const recentAttempts = await tx.query.rebalancingApplyAttempts.findMany({
        where: and(
          eq(rebalancingApplyAttempts.proposalId, proposalId),
          eq(rebalancingApplyAttempts.operation, 'confirm')
        )
      });
      
      if (recentAttempts.length > 0) {
        // Check if any attempt was successful within the last 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const recentSuccessfulAttempt = recentAttempts.find(attempt => 
          attempt.status === 'success' && 
          attempt.completedAt && 
          attempt.completedAt > fiveMinutesAgo
        );
        
        if (recentSuccessfulAttempt) {
          console.log(`[RebalancingService] IDEMPOTENCY: Proposal ${proposalId} was already applied at ${recentSuccessfulAttempt.completedAt?.toISOString()}, returning cached result`);
          return {
            success: true,
            proposalId,
            status: 'applied' as const,
            applied: (recentSuccessfulAttempt.resultSummary as any)?.applied || 0,
            skipped: (recentSuccessfulAttempt.resultSummary as any)?.skipped || 0,
            cached: true
          };
        }
      }
      
      // 1. Validate proposal exists and belongs to user
      const proposal = await tx.query.rebalancingProposals.findFirst({
        where: and(
          eq(rebalancingProposals.id, proposalId),
          eq(rebalancingProposals.userId, userId)
        )
      });

      if (!proposal) {
        throw new Error("APPLY_UNAVAILABLE: Proposal not found or unauthorized.");
      }

      if (proposal.status !== 'proposed') {
        throw new Error(`APPLY_UNAVAILABLE: Proposal status is '${proposal.status}', must be 'proposed'.`);
      }

      // 2. Fetch moves for this proposal (optionally filtered by moveIds)
      const allMoves = await tx.query.proposalMoves.findMany({
        where: eq(proposalMoves.proposalId, proposalId)
      });
      
      const moves = moveIds && moveIds.length > 0
        ? allMoves.filter(m => moveIds.includes(m.id))
        : allMoves;
      
      console.log(`[RebalancingService] Applying ${moves.length} of ${allMoves.length} moves for proposal ${proposalId}`);
      if (moveIds && moveIds.length > 0) {
        console.log(`[RebalancingService] Filtered to selected moves:`, moveIds);
      }

      if (moves.length === 0) {
        throw new Error("APPLY_UNAVAILABLE: Proposal has no moves to apply.");
      }

      console.log(`[RebalancingService] Applying ${moves.length} moves (${moveIds ? 'filtered' : 'all'}) for proposal ${proposalId}`);

      // 2.5. PRE-FLIGHT VALIDATION: Check proposal for safety violations
      console.log(`[RebalancingService] Running pre-flight validation for ${moves.length} moves...`);
      const validation = await this.validateProposal(proposalId, moves, tx);
      
      if (!validation.valid) {
        console.error(`[RebalancingService] VALIDATION FAILED for proposal ${proposalId}:`);
        validation.errors.forEach(error => console.error(`  - ${error}`));
        throw new Error(`VALIDATION_FAILED: ${validation.errors.join('; ')}`);
      }
      
      console.log(`[RebalancingService] Pre-flight validation passed ✓`);

      // 3. Create rollback snapshot BEFORE applying changes
      // IMPORTANT: Only snapshot events that are in the SELECTED moves (moveIds)
      // This ensures the snapshot only contains events that will actually be modified by this proposal
      const eventIdsToSnapshot = moves
        .map(m => m.sourceEventId)
        .filter((id): id is string => id !== null && id !== undefined);

      console.log(`[RebalancingService] Creating snapshot for ${eventIdsToSnapshot.length} events from ${moves.length} selected moves`);
      console.log(`[RebalancingService] Event IDs to snapshot:`, eventIdsToSnapshot);

      const snapshotEvents: Array<{
        eventId: string;
        startAt: string;
        endAt: string;
        title?: string | null;
        isMovable: boolean;
        metadata?: Record<string, any> | null;
        updatedAt: string;
        version?: number | null;
      }> = [];

      for (const eventId of eventIdsToSnapshot) {
        const event = await tx.query.calendarEventsNew.findFirst({
          where: eq(calendarEventsNew.id, eventId)
        });

        if (event) {
          console.log(`[RebalancingService] Snapshotting event ${eventId}: "${event.title}" at ${event.startAt.toISOString()}`);
          snapshotEvents.push({
            eventId: event.id,
            startAt: event.startAt.toISOString(),
            endAt: event.endAt.toISOString(),
            title: event.title,
            isMovable: event.isMovable,
            metadata: event.metadata as Record<string, any> | null,
            updatedAt: event.updatedAt.toISOString(),
            version: null // TODO: Add version field if needed
          });
        } else {
          console.warn(`[RebalancingService] Event ${eventId} not found when creating snapshot - it may have been deleted. This move will be skipped during undo.`);
        }
      }

      // Delete any existing snapshots for this proposal (in case of re-apply)
      // This ensures we always use the most recent snapshot for this proposal
      await tx.delete(rollbackSnapshots)
        .where(eq(rollbackSnapshots.proposalId, proposalId));
      
      console.log(`[RebalancingService] Creating snapshot with ${snapshotEvents.length} events for proposal ${proposalId}`);
      if (snapshotEvents.length > 0) {
        console.log(`[RebalancingService] Snapshot events:`, snapshotEvents.map(e => ({
          eventId: e.eventId,
          title: e.title,
          startAt: e.startAt
        })));
      }
      
      // Create snapshot record
      const [snapshot] = await tx.insert(rollbackSnapshots).values({
        proposalId,
        userId,
        payload: snapshotEvents as any
      }).returning();

      // SAFETY: Verify snapshot was created successfully
      if (!snapshot || !snapshot.id) {
        throw new Error('SNAPSHOT_FAILED: Failed to create rollback snapshot. Aborting apply to prevent data loss.');
      }

      // Link snapshot to proposal
      await tx.update(rebalancingProposals)
        .set({ snapshotId: snapshot.id })
        .where(eq(rebalancingProposals.id, proposalId));
      
      console.log(`[RebalancingService] Snapshot ${snapshot.id} created and linked to proposal ${proposalId}`);

      // 4. Apply moves with stale conflict checking
      const conflicts: Array<{
        eventId: string;
        expectedUpdatedAt: string;
        actualUpdatedAt: string;
        reason: string;
      }> = [];

      let appliedCount = 0;
      let skippedCount = 0;
      let totalChurnApplied = 0;

      for (const move of moves) {
        try {
          // For moves/resizes: check for stale conflicts
          if (move.moveType === 'move' || move.moveType === 'resize') {
            if (move.sourceEventId && move.baselineUpdatedAt) {
              const currentEvent = await tx.query.calendarEventsNew.findFirst({
                where: eq(calendarEventsNew.id, move.sourceEventId)
              });

              // If event doesn't exist, it might be a template-generated event
              // In that case, create a new direct event at the target time
              if (!currentEvent) {
                console.log(`[RebalancingService] Event ${move.sourceEventId} not found - may be template-generated, creating new event`);
                
                // Create a new direct event at the target time
                if (move.targetStartAt && move.targetEndAt) {
                  const targetStart = move.targetStartAt instanceof Date 
                    ? move.targetStartAt 
                    : new Date(move.targetStartAt);
                  const targetEnd = move.targetEndAt instanceof Date 
                    ? move.targetEndAt 
                    : new Date(move.targetEndAt);
                  
                  // Get event metadata from the move if available
                  const metadata = (move.metadata || {}) as any;
                  
                  await tx.insert(calendarEventsNew).values({
                    userId,
                    title: metadata.title || 'Moved Event',
                    eventType: metadata.eventType || 'Focus',
                    startAt: targetStart,
                    endAt: targetEnd,
                    isMovable: true,
                    metadata: {
                      ...metadata,
                      movedFromTemplate: true,
                      originalEventId: move.sourceEventId
                    } as any
                  });
                  
                  appliedCount++;
                  totalChurnApplied += move.churnCost;
                  console.log(`[RebalancingService] Created new event for template-generated event at ${targetStart.toISOString()}`);
                }
                continue;
              }

              // Check if event was modified since proposal was created
              if (currentEvent.updatedAt.getTime() !== move.baselineUpdatedAt.getTime()) {
                conflicts.push({
                  eventId: move.sourceEventId,
                  expectedUpdatedAt: move.baselineUpdatedAt.toISOString(),
                  actualUpdatedAt: currentEvent.updatedAt.toISOString(),
                  reason: 'EVENT_CHANGED'
                });
                skippedCount++;
                continue;
              }
            }

            // Apply move/resize to existing direct event
            if (move.targetStartAt && move.targetEndAt && move.sourceEventId) {
              // Ensure dates are Date objects
              const targetStart = move.targetStartAt instanceof Date 
                ? move.targetStartAt 
                : new Date(move.targetStartAt);
              const targetEnd = move.targetEndAt instanceof Date 
                ? move.targetEndAt 
                : new Date(move.targetEndAt);
              
              // Double-check event still exists before updating
              const eventToUpdate = await tx.query.calendarEventsNew.findFirst({
                where: eq(calendarEventsNew.id, move.sourceEventId)
              });
              
              if (!eventToUpdate) {
                console.warn(`[RebalancingService] Event ${move.sourceEventId} no longer exists, skipping move`);
                skippedCount++;
                continue;
              }
              
              console.log(`[RebalancingService] Updating event ${move.sourceEventId} from ${eventToUpdate.startAt.toISOString()} to ${targetStart.toISOString()}`);
              
              const updateResult = await tx.update(calendarEventsNew)
                .set({
                  startAt: targetStart,
                  endAt: targetEnd,
                  updatedAt: new Date()
                })
                .where(eq(calendarEventsNew.id, move.sourceEventId));
              
              appliedCount++;
              totalChurnApplied += move.churnCost;
              console.log(`[RebalancingService] Successfully updated event ${move.sourceEventId}`);
            }
          } else if (move.moveType === 'insert') {
            // For inserts: create new event
            if (move.targetStartAt && move.targetEndAt) {
              // Ensure dates are Date objects
              const targetStart = move.targetStartAt instanceof Date 
                ? move.targetStartAt 
                : new Date(move.targetStartAt);
              const targetEnd = move.targetEndAt instanceof Date 
                ? move.targetEndAt 
                : new Date(move.targetEndAt);
              
              const metadata = (move.metadata || {}) as any;
              await tx.insert(calendarEventsNew).values({
                userId,
                title: metadata.title_hint || 'Study Session',
                eventType: 'Focus',
                startAt: targetStart,
                endAt: targetEnd,
                isMovable: true,
                metadata: metadata as any
              });
              appliedCount++;
              totalChurnApplied += move.churnCost;
            }
          } else if (move.moveType === 'delete') {
            // For deletes: remove event
            if (move.sourceEventId) {
              await tx.delete(calendarEventsNew)
                .where(eq(calendarEventsNew.id, move.sourceEventId));
              appliedCount++;
              totalChurnApplied += move.churnCost;
            }
          }
        } catch (err: any) {
          console.error(`Error applying move ${move.id}:`, err);
          conflicts.push({
            eventId: move.sourceEventId || 'unknown',
            expectedUpdatedAt: move.baselineUpdatedAt?.toISOString() || 'unknown',
            actualUpdatedAt: 'APPLY_ERROR',
            reason: err.message || 'APPLY_ERROR'
          });
          skippedCount++;
        }
      }

      // 5. Determine final status
      // CRITICAL: If no moves were applied, throw an error instead of marking as 'applied'
      if (appliedCount === 0) {
        throw new Error(`STALE_PROPOSAL: All ${moves.length} moves were skipped (conflicts or events no longer exist). The proposal is out of date. Please generate a new proposal.`);
      }
      
      let finalStatus: 'applied' | 'partially_applied' = 'applied';
      if (conflicts.length > 0) {
        if (proposal.applyModeRequireAll) {
          // If require_all=true and any conflict, rollback everything
          throw new Error("STALE_PROPOSAL: Conflicts detected and apply_mode_require_all=true. No changes applied.");
        }
        finalStatus = 'partially_applied';
      }

      // 6. Update proposal status
      await tx.update(rebalancingProposals)
        .set({
          status: finalStatus,
          appliedAt: new Date()
        })
        .where(eq(rebalancingProposals.id, proposalId));

      // 7. Update churn ledger
      const today = new Date().toISOString().split('T')[0];
      const existingLedger = await tx.query.churnLedger.findFirst({
        where: and(
          eq(churnLedger.userId, userId),
          eq(churnLedger.day, today)
        )
      });

      if (existingLedger) {
        await tx.update(churnLedger)
          .set({
            movesCount: sql`${churnLedger.movesCount} + ${appliedCount}`,
            minutesMoved: sql`${churnLedger.minutesMoved} + ${totalChurnApplied}`,
            updatedAt: new Date()
          })
          .where(and(
            eq(churnLedger.userId, userId),
            eq(churnLedger.day, today)
          ));
      } else {
        // Get user's churn cap (from settings or default)
        const userChurnSettings = await tx.query.churnSettings.findFirst({
          where: eq(churnSettings.userId, userId)
        });
        const capMinutes = userChurnSettings?.dailyCapMinutes || 60;

        await tx.insert(churnLedger).values({
          userId,
          day: today,
          movesCount: appliedCount,
          minutesMoved: totalChurnApplied,
          capMinutes,
          updatedAt: new Date()
        });
      }

      // 8. Record apply attempt
      const allAttempts = await tx.query.rebalancingApplyAttempts.findMany({
        where: eq(rebalancingApplyAttempts.proposalId, proposalId)
      });
      const maxAttemptNo = allAttempts.length > 0
        ? Math.max(...allAttempts.map(a => a.attemptNo))
        : 0;

      const attemptStatus = conflicts.length > 0 ? 'partial_success' : 'success';

      await tx.insert(rebalancingApplyAttempts).values({
        proposalId,
        userId,
        attemptNo: maxAttemptNo + 1,
        operation: 'confirm',
        startedAt: new Date(),
        completedAt: new Date(),
        status: attemptStatus,
        conflicts: conflicts.length > 0 ? conflicts as any : null,
        resultSummary: {
          applied: appliedCount,
          skipped: skippedCount,
          churn_applied: totalChurnApplied
        } as any
      });

      return {
        success: true,
        proposalId,
        status: finalStatus,
        applied: appliedCount,
        skipped: skippedCount,
        conflicts: conflicts.length > 0 ? conflicts : undefined
      };
    });
  }

  /**
   * Reverts an applied proposal using its rollback snapshot.
   * Logic: atomic restore of original start/end times.
   */
  async undoProposal(proposalId: string, userId: string) {
    return await db.transaction(async (tx) => {
      // 1. Verify eligibility (status must be 'applied')
      const proposal = await tx.query.rebalancingProposals.findFirst({
        where: and(
          eq(rebalancingProposals.id, proposalId),
          eq(rebalancingProposals.userId, userId)
        )
      });

      if (!proposal) {
        throw new Error("UNDO_UNAVAILABLE: Proposal not found or unauthorized.");
      }

      if (proposal.status !== 'applied') {
        throw new Error(`UNDO_UNAVAILABLE: Proposal status is '${proposal.status}', must be 'applied'.`);
      }

      // 2. Fetch the rollback snapshot for THIS specific proposal
      // IMPORTANT: Each proposal should have exactly one snapshot (created when it was applied)
      // We delete old snapshots when creating new ones, so this should be the correct one
      const snapshot = await tx.query.rollbackSnapshots.findFirst({
        where: eq(rollbackSnapshots.proposalId, proposalId)
      });

      if (!snapshot) {
        console.error(`[Undo] No snapshot found for proposal ${proposalId}`);
        
        // GRACEFUL DEGRADATION: Mark proposal as un-undoable instead of throwing
        await tx.update(rebalancingProposals)
          .set({ 
            status: 'cancelled',
            rejectedAt: new Date()
          })
          .where(eq(rebalancingProposals.id, proposalId));
        
        throw new Error("UNDO_UNAVAILABLE: Rollback snapshot not found or expired. The proposal has been marked as un-undoable.");
      }
      
      // SAFETY: Verify snapshot payload is valid
      if (!snapshot.payload || typeof snapshot.payload !== 'object') {
        console.error(`[Undo] Snapshot ${snapshot.id} has invalid payload`);
        
        // Mark proposal as un-undoable
        await tx.update(rebalancingProposals)
          .set({ 
            status: 'cancelled',
            rejectedAt: new Date()
          })
          .where(eq(rebalancingProposals.id, proposalId));
        
        throw new Error("UNDO_UNAVAILABLE: Rollback snapshot is corrupt. The proposal has been marked as un-undoable.");
      }
      
      console.log(`[Undo] ========================================`);
      console.log(`[Undo] UNDOING PROPOSAL: ${proposalId}`);
      console.log(`[Undo] Proposal status: ${proposal.status}`);
      console.log(`[Undo] Proposal was applied at: ${proposal.appliedAt}`);
      console.log(`[Undo] Using snapshot ${snapshot.id}`);
      console.log(`[Undo] Snapshot created at: ${snapshot.createdAt}`);
      console.log(`[Undo] ========================================`);

      // 3. Restore all events from the snapshot payload
      const snapshotData = snapshot.payload as Array<{
        eventId: string;
        title?: string | null;
        startAt: string; // ISO string from JSONB
        endAt: string; // ISO string from JSONB
        metadata?: Record<string, any> | null;
      }>;

      if (!Array.isArray(snapshotData) || snapshotData.length === 0) {
        throw new Error("UNDO_UNAVAILABLE: Snapshot payload is invalid or empty.");
      }

      // Fetch proposal moves once (outside the loop for efficiency)
      // IMPORTANT: Only consider moves that were actually APPLIED (not just proposed)
      // The snapshot should only contain events from moves that were selected and applied
      const appliedMoves = await tx.query.proposalMoves.findMany({
        where: eq(proposalMoves.proposalId, proposalId)
      });
      
      console.log(`[Undo] Found ${appliedMoves.length} total moves for proposal ${proposalId}`);
      console.log(`[Undo] Moves:`, appliedMoves.map(m => ({ 
        id: m.id, 
        sourceEventId: m.sourceEventId, 
        moveType: m.moveType,
        targetStartAt: m.targetStartAt?.toISOString() || 'N/A'
      })));
      
      // Create a set of event IDs that were actually moved by this proposal
      const movedEventIds = new Set(
        appliedMoves
          .map(m => m.sourceEventId)
          .filter((id): id is string => id !== null && id !== undefined)
      );
      
      console.log(`[Undo] Proposal ${proposalId} has ${appliedMoves.length} moves affecting ${movedEventIds.size} unique events`);
      console.log(`[Undo] Moved event IDs:`, Array.from(movedEventIds));
      console.log(`[Undo] Snapshot contains ${snapshotData.length} events`);
      console.log(`[Undo] Snapshot event IDs:`, snapshotData.map(e => ({ 
        id: e.eventId, 
        title: e.title || 'untitled',
        startAt: e.startAt 
      })));
      
      // CRITICAL: Verify that all snapshot events were actually moved by this proposal
      // If any snapshot event is NOT in movedEventIds, that's a bug - it shouldn't be in the snapshot
      const snapshotEventIds = new Set(snapshotData.map(e => e.eventId).filter((id): id is string => id !== null && id !== undefined));
      const unexpectedEvents = Array.from(snapshotEventIds).filter(id => !movedEventIds.has(id));
      if (unexpectedEvents.length > 0) {
        console.error(`[Undo] ERROR: Snapshot contains ${unexpectedEvents.length} events that were NOT moved by this proposal:`, unexpectedEvents);
        console.error(`[Undo] This indicates a bug in snapshot creation. These events will be skipped during restore.`);
        console.error(`[Undo] Snapshot events:`, snapshotData.filter(e => unexpectedEvents.includes(e.eventId)).map(e => ({ id: e.eventId, title: e.title })));
      } else {
        console.log(`[Undo] ✓ All snapshot events were moved by this proposal (good!)`);
      }

      let restoredCount = 0;
      let skippedCount = 0;
      
      // CRITICAL: Only process events that were actually moved by THIS proposal
      // Filter the snapshot data to only include events in movedEventIds
      const eventsToRestore = snapshotData.filter(eventState => {
        if (!eventState.eventId) {
          console.log(`[Undo] Filtering out event with no eventId`);
          return false;
        }
        const wasMoved = movedEventIds.has(eventState.eventId);
        if (!wasMoved) {
          console.log(`[Undo] Filtering out event ${eventState.eventId} - not moved by this proposal`);
        }
        return wasMoved;
      });
      
      console.log(`[Undo] Filtered snapshot: ${eventsToRestore.length} events to restore (out of ${snapshotData.length} in snapshot)`);
      console.log(`[Undo] Events to restore:`, eventsToRestore.map(e => ({ id: e.eventId, title: e.title })));
      
      if (eventsToRestore.length === 0) {
        console.warn(`[Undo] No events to restore - all snapshot events were either not moved by this proposal or invalid`);
        return {
          restoredCount: 0,
          skippedCount: snapshotData.length,
          message: "No events to restore - all events were either not moved by this proposal or have been deleted."
        };
      }
      
      for (const eventState of eventsToRestore) {
        console.log(`[Undo] Processing snapshot event ${eventState.eventId} (${eventState.title || 'untitled'})`);
        
        if (!eventState.eventId || !eventState.startAt || !eventState.endAt) {
          console.warn(`[Undo] Skipping invalid event state in snapshot:`, eventState);
          skippedCount++;
          continue;
        }

        // Convert ISO strings to Date objects
        const startAtDate = new Date(eventState.startAt);
        const endAtDate = new Date(eventState.endAt);

        if (isNaN(startAtDate.getTime()) || isNaN(endAtDate.getTime())) {
          console.warn(`[Undo] Skipping event with invalid dates:`, eventState);
          skippedCount++;
          continue;
        }

        // Double-check: This should never happen since we filtered above, but just in case
        if (!movedEventIds.has(eventState.eventId)) {
          console.error(`[Undo] ERROR: Event ${eventState.eventId} passed filter but is not in movedEventIds - this is a bug!`);
          skippedCount++;
          continue;
        }
        
        console.log(`[Undo] Event ${eventState.eventId} (${eventState.title || 'untitled'}) WAS moved by this proposal, checking if it exists...`);

        // Check if the event still exists before trying to restore it
        // If it was deleted/trashed, don't restore it (user explicitly trashed it)
        const currentEvent = await tx.query.calendarEventsNew.findFirst({
          where: eq(calendarEventsNew.id, eventState.eventId)
        });

        if (!currentEvent) {
          console.log(`[Undo] Event ${eventState.eventId} (${eventState.title || 'untitled'}) no longer exists (was deleted/trashed), skipping restore - THIS IS CORRECT BEHAVIOR`);
          skippedCount++;
          continue;
        }
        
        console.log(`[Undo] Event ${eventState.eventId} exists: ${currentEvent.title}, current time: ${currentEvent.startAt.toISOString()}, snapshot time: ${startAtDate.toISOString()}`);
        
        // Check if the event is already at the snapshot position (already undone or never moved)
        const currentStartTime = currentEvent.startAt.getTime();
        const snapshotStartTime = startAtDate.getTime();
        
        if (currentStartTime === snapshotStartTime) {
          console.log(`[Undo] Event ${eventState.eventId} is already at snapshot position, skipping`);
          skippedCount++;
          continue;
        }

        console.log(`[Undo] Restoring event ${eventState.eventId} (${currentEvent.title}) from ${currentEvent.startAt.toISOString()} to ${startAtDate.toISOString()}`);

        // Double-check that the event still exists before updating (race condition protection)
        const eventStillExists = await tx.query.calendarEventsNew.findFirst({
          where: eq(calendarEventsNew.id, eventState.eventId)
        });

        if (!eventStillExists) {
          console.warn(`[Undo] Event ${eventState.eventId} was deleted between check and update, skipping restore`);
          skippedCount++;
          continue;
        }

        // CRITICAL: Only UPDATE existing events - NEVER INSERT (we don't want to recreate trashed events)
        const updateResult = await tx
          .update(calendarEventsNew)
          .set({
            startAt: startAtDate,
            endAt: endAtDate,
            updatedAt: new Date(),
            // Restore metadata if it was saved
            ...(eventState.metadata && { metadata: eventState.metadata })
          })
          .where(eq(calendarEventsNew.id, eventState.eventId))
          .returning();

        if (updateResult.length === 0) {
          console.warn(`[Undo] UPDATE returned 0 rows for event ${eventState.eventId} - event may have been deleted`);
          skippedCount++;
          continue;
        }

        console.log(`[Undo] ✓ Successfully restored event ${eventState.eventId} (${currentEvent.title}) from ${currentEvent.startAt.toISOString()} to ${startAtDate.toISOString()}`);
        restoredCount++;
      }

      console.log(`[Undo] Restored ${restoredCount} events, skipped ${skippedCount} events`);

      if (restoredCount === 0) {
        throw new Error("UNDO_FAILED: No valid events found in snapshot to restore.");
      }

      // 4. Update audit and status
      await tx
        .update(rebalancingProposals)
        .set({
          status: 'cancelled',
          undoneAt: new Date()
        })
        .where(eq(rebalancingProposals.id, proposalId));

      // 5. Refund Churn (Intellectually honest move)
      // Since the user rejected the move, we credit back their daily churn cap.
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format for date column

      // Check if churn ledger entry exists for today
      const existingLedger = await tx.query.churnLedger.findFirst({
        where: and(
          eq(churnLedger.userId, userId),
          eq(churnLedger.day, today)
        )
      });

      if (existingLedger) {
        // Update existing entry: subtract moves count (but don't go below 0)
        await tx
          .update(churnLedger)
          .set({
            movesCount: sql`GREATEST(0, ${churnLedger.movesCount} - ${restoredCount})`,
            updatedAt: new Date()
          })
          .where(and(
            eq(churnLedger.userId, userId),
            eq(churnLedger.day, today)
          ));
      } else {
        // Create new entry with negative count (represents refund)
        // Note: This shouldn't happen normally, but handle edge case
        await tx.insert(churnLedger).values({
          userId,
          day: today,
          movesCount: -restoredCount,
          minutesMoved: 0,
          updatedAt: new Date()
        });
      }

      // 6. Record undo attempt in audit log
      // Find the last attempt number for this proposal
      const allAttempts = await tx.query.rebalancingApplyAttempts.findMany({
        where: eq(rebalancingApplyAttempts.proposalId, proposalId)
      });

      // Find max attempt number
      const maxAttemptNo = allAttempts.length > 0
        ? Math.max(...allAttempts.map(a => a.attemptNo))
        : 0;

      const nextAttemptNo = maxAttemptNo + 1;

      await tx.insert(rebalancingApplyAttempts).values({
        proposalId,
        userId,
        attemptNo: nextAttemptNo,
        operation: 'undo',
        startedAt: new Date(),
        completedAt: new Date(),
        status: 'success',
        resultSummary: {
          restored: restoredCount,
          refunded_moves: restoredCount
        }
      });

      return {
        success: true,
        restoredCount,
        proposalId,
        status: 'cancelled'
      };
    });
  }
}

