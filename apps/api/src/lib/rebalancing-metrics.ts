import { db } from './db';
import { rebalancingProposals, rebalancingApplyAttempts } from '../../../../packages/db/src/schema';
import { eq, and, gte, desc } from 'drizzle-orm';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  lastProposalGenerated: string | null;
  lastProposalApplied: string | null;
  activeProposals: number;
  undoRate24h: number;
  avgProposalAge: string;
  metrics: {
    generated24h: number;
    applied24h: number;
    rejected24h: number;
    undone24h: number;
    acceptanceRate: number;
  };
}

export class RebalancingMetrics {
  /**
   * Get system health status and key metrics
   */
  async getHealthStatus(userId?: string): Promise<HealthStatus> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Query proposals from the last 24 hours
    // Fix: Use query builder for gte operator
    const recentProposals = userId
      ? await db
          .select()
          .from(rebalancingProposals)
          .where(
            and(
              eq(rebalancingProposals.userId, userId),
              gte(rebalancingProposals.createdAt, oneDayAgo)
            )
          )
          .orderBy(desc(rebalancingProposals.createdAt))
      : await db
          .select()
          .from(rebalancingProposals)
          .where(gte(rebalancingProposals.createdAt, oneDayAgo))
          .orderBy(desc(rebalancingProposals.createdAt));

    // Count by status
    const generated24h = recentProposals.length;
    const applied24h = recentProposals.filter(p => p.status === 'applied' || p.status === 'partially_applied').length;
    const rejected24h = recentProposals.filter(p => p.status === 'cancelled' && !p.undoneAt).length;
    const undone24h = recentProposals.filter(p => p.undoneAt !== null).length;

    // Calculate acceptance rate (applied / generated)
    const acceptanceRate = generated24h > 0 ? applied24h / generated24h : 0;

    // Calculate undo rate (undone / applied)
    const undoRate24h = applied24h > 0 ? undone24h / applied24h : 0;

    // Find most recent proposal and apply times
    const allProposals = await db.query.rebalancingProposals.findMany({
      where: userId ? eq(rebalancingProposals.userId, userId) : undefined,
      orderBy: [desc(rebalancingProposals.createdAt)],
      limit: 1
    });

    const lastProposalGenerated = allProposals.length > 0 
      ? allProposals[0].createdAt.toISOString() 
      : null;

    const appliedProposals = await db.query.rebalancingProposals.findMany({
      where: userId 
        ? and(
            eq(rebalancingProposals.userId, userId),
            eq(rebalancingProposals.status, 'applied')
          )
        : eq(rebalancingProposals.status, 'applied'),
      orderBy: [desc(rebalancingProposals.appliedAt)],
      limit: 1
    });

    const lastProposalApplied = appliedProposals.length > 0 && appliedProposals[0].appliedAt
      ? appliedProposals[0].appliedAt.toISOString()
      : null;

    // Count active (proposed) proposals
    const activeProposals = recentProposals.filter(p => p.status === 'proposed').length;

    // Calculate average proposal age (for proposed proposals only)
    const proposedProposals = recentProposals.filter(p => p.status === 'proposed');
    let avgProposalAge = '0 minutes';
    if (proposedProposals.length > 0) {
      const totalAge = proposedProposals.reduce((sum, p) => {
        return sum + (now.getTime() - p.createdAt.getTime());
      }, 0);
      const avgAgeMs = totalAge / proposedProposals.length;
      const avgAgeMinutes = Math.round(avgAgeMs / (1000 * 60));
      avgProposalAge = `${avgAgeMinutes} minutes`;
    }

    // Determine health status
    let status: 'healthy' | 'degraded' | 'down' = 'healthy';
    
    // Degraded if undo rate > 30% (indicates poor heuristic quality)
    if (undoRate24h > 0.3) {
      status = 'degraded';
      console.warn(`[RebalancingMetrics] DEGRADED: High undo rate (${(undoRate24h * 100).toFixed(1)}%)`);
    }
    
    // Degraded if no proposals generated in last hour (system may be stuck)
    if (lastProposalGenerated) {
      const lastGenTime = new Date(lastProposalGenerated).getTime();
      const oneHourAgo = now.getTime() - 60 * 60 * 1000;
      if (lastGenTime < oneHourAgo && generated24h === 0) {
        status = 'degraded';
        console.warn(`[RebalancingMetrics] DEGRADED: No proposals generated in last hour`);
      }
    }

    // Down if no proposals generated in last 24 hours (system is not working)
    if (generated24h === 0) {
      status = 'down';
      console.error(`[RebalancingMetrics] DOWN: No proposals generated in last 24 hours`);
    }

    return {
      status,
      lastProposalGenerated,
      lastProposalApplied,
      activeProposals,
      undoRate24h,
      avgProposalAge,
      metrics: {
        generated24h,
        applied24h,
        rejected24h,
        undone24h,
        acceptanceRate
      }
    };
  }

  /**
   * Log a proposal generation event
   */
  async logProposalGeneration(userId: string, energyLevel: number, movesCount: number, churnCost: number) {
    console.log(`[RebalancingMetrics] Proposal generated: userId=${userId}, energyLevel=${energyLevel}, moves=${movesCount}, churn=${churnCost}`);
  }

  /**
   * Log a proposal apply event
   */
  async logProposalApply(proposalId: string, appliedCount: number, skippedCount: number, conflicts: number) {
    console.log(`[RebalancingMetrics] Proposal applied: proposalId=${proposalId}, applied=${appliedCount}, skipped=${skippedCount}, conflicts=${conflicts}`);
  }

  /**
   * Log a proposal undo event
   */
  async logProposalUndo(proposalId: string, restoredCount: number, reason?: string) {
    console.log(`[RebalancingMetrics] Proposal undone: proposalId=${proposalId}, restored=${restoredCount}, reason=${reason || 'user_requested'}`);
  }
}




