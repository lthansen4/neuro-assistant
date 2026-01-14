import { Hono } from 'hono';
import { db } from '../lib/db';
import { users, courses } from '../../../../packages/db/src/schema';
import { eq } from 'drizzle-orm';

export const userRoute = new Hono();

// Helper to get userId
async function getUserId(c: any): Promise<string | null> {
  const clerkUserId = c.req.header('x-clerk-user-id');
  if (!clerkUserId) {
    console.error('[User API] Missing x-clerk-user-id header');
    return null;
  }

  const user = await db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId)
  });

  return user?.id || null;
}

/**
 * GET /api/user/courses
 * 
 * Get all courses for the current user
 */
userRoute.get('/courses', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const userCourses = await db.query.courses.findMany({
      where: eq(courses.userId, userId)
    });

    return c.json({
      ok: true,
      courses: userCourses.map(course => ({
        id: course.id,
        name: course.name,
        professor: course.professor,
      }))
    });

  } catch (error: any) {
    console.error('[User API] Error fetching courses:', error);
    return c.json({ error: error.message || 'Failed to fetch courses' }, 500);
  }
});

