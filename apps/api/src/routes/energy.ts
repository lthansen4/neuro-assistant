import { Hono } from 'hono';
import { HeuristicEngine } from '../lib/heuristic-engine';
import { db } from '../lib/db';
import { users } from '../../../../packages/db/src/schema';
import { eq } from 'drizzle-orm';

/**
 * Energy Routes
 * 
 * Endpoints for energy tracking and energy-based optimization triggers
 */

const energyRoute = new Hono();

/**
 * Helper to convert Clerk user ID to database UUID
 */
async function getUserId(c: any): Promise<string | null> {
  const clerkUserId = c.req.header('x-clerk-user-id');
  if (!clerkUserId) {
    console.error('[Energy API] Missing x-clerk-user-id header');
    return null;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId)
  });

  if (!user) {
    console.error('[Energy API] User not found for Clerk ID:', clerkUserId);
    return null;
  }

  return user.id;
}

// Store for tracking previous energy levels (in-memory for now)
// In production, this should be in the database
const previousEnergyLevels = new Map<string, number>();

/**
 * POST /api/energy/update
 * 
 * Update user's energy level and trigger optimization if significant change
 */
energyRoute.post('/update', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const body = await c.req.json();
    const newEnergyLevel = body.energy_level;

    if (typeof newEnergyLevel !== 'number' || newEnergyLevel < 1 || newEnergyLevel > 10) {
      return c.json({ error: 'Invalid energy_level. Must be between 1 and 10.' }, 400);
    }

    console.log(`[EnergyAPI] User ${userId} updated energy level to ${newEnergyLevel}`);

    // Get previous energy level
    const previousLevel = previousEnergyLevels.get(userId) || 5;
    const delta = Math.abs(newEnergyLevel - previousLevel);

    // Store new level
    previousEnergyLevels.set(userId, newEnergyLevel);

    // Check if we should trigger optimization
    const ENERGY_CHANGE_THRESHOLD = 3; // From heuristic config
    let proposalId = null;
    let movesCount = 0;

    if (delta >= ENERGY_CHANGE_THRESHOLD) {
      console.log(`[EnergyAPI] Significant energy change detected (delta: ${delta}). Triggering optimization...`);
      
      const engine = new HeuristicEngine(userId);
      const result = await engine.generateComprehensiveProposal({
        userId,
        energyLevel: newEnergyLevel,
        type: 'energy_change',
        lookaheadDays: 3 // Only optimize next 3 days for energy changes
      });

      proposalId = result.proposalId;
      movesCount = result.moves.length;

      console.log(`[EnergyAPI] Generated ${movesCount} optimization moves due to energy change`);
    } else {
      console.log(`[EnergyAPI] Energy change not significant enough to trigger optimization (delta: ${delta})`);
    }

    return c.json({
      ok: true,
      energy_level: newEnergyLevel,
      previous_level: previousLevel,
      delta,
      optimization_triggered: delta >= ENERGY_CHANGE_THRESHOLD,
      proposal_id: proposalId,
      moves_count: movesCount,
      message: delta >= ENERGY_CHANGE_THRESHOLD
        ? `Energy change detected! Generated ${movesCount} optimization suggestions.`
        : 'Energy level updated.'
    });

  } catch (error) {
    console.error('[EnergyAPI] Update error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Failed to update energy level' 
    }, 500);
  }
});

/**
 * GET /api/energy/current
 * 
 * Get current energy level
 */
energyRoute.get('/current', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const currentLevel = previousEnergyLevels.get(userId) || 5;

    return c.json({
      ok: true,
      energy_level: currentLevel
    });

  } catch (error) {
    console.error('[EnergyAPI] Get current error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Failed to get energy level' 
    }, 500);
  }
});

/**
 * GET /api/energy/history
 * 
 * Get energy level history (placeholder for future implementation)
 */
energyRoute.get('/history', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    // TODO: Implement proper energy history tracking in database
    // For now, return empty array
    return c.json({
      ok: true,
      history: [],
      message: 'Energy history tracking coming soon'
    });

  } catch (error) {
    console.error('[EnergyAPI] Get history error:', error);
    return c.json({ 
      error: error instanceof Error ? error.message : 'Failed to get energy history' 
    }, 500);
  }
});

export default energyRoute;

