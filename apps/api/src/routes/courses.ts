import { Hono } from 'hono';
import { db, schema } from '../lib/db';
import { eq } from 'drizzle-orm';
import { getUserId } from '../lib/auth-utils';

export const coursesRoute = new Hono();

coursesRoute.get('/', async (c) => {
  try {
    const userId = await getUserId(c);
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const courses = await db.query.courses.findMany({
      where: eq(schema.courses.userId, userId),
      orderBy: (courses, { asc }) => [asc(courses.name)],
    });

    return c.json({ ok: true, items: courses });
  } catch (error: any) {
    console.error('[Courses API] Error fetching courses:', error);
    return c.json({ error: error.message || 'Failed to fetch courses' }, 500);
  }
});
