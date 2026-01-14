import { Hono } from 'hono';
import { db, schema } from '../lib/db';
import { eq, and, gte, lte } from 'drizzle-orm';
import { getUserId } from './dashboard';
import { DateTime } from 'luxon';
import { sql } from 'drizzle-orm';

export const calendarRoute = new Hono();

// GET /api/calendar/events
// Fetches calendar events for the authenticated user
// Query params: start (ISO date), end (ISO date) - optional, defaults to next 14 days
calendarRoute.get('/events', async (c) => {
  try {
    const userId = await getUserId(c);
    
    // Get date range from query params (default to today to future 14 days to catch all events)
    const startParam = c.req.query('start');
    const endParam = c.req.query('end');
    
    const now = new Date();
    // Start from today (events are generated from today onwards)
    const start = startParam ? new Date(startParam) : new Date(now.setHours(0, 0, 0, 0));
    // End 14 days in the future (matching buildOccurrencesFor2Weeks)
    const end = endParam ? new Date(endParam) : new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    
    console.log(`[Calendar] Fetching events for user ${userId}, date range: ${start.toISOString()} to ${end.toISOString()}`);
    
    // Check if calendar_events_new exists (migration 0008)
    // Use a simple try-catch to check table existence
    let useNewTable = false;
    try {
      await db.execute(sql`SELECT 1 FROM calendar_events_new LIMIT 1`);
      useNewTable = true;
      console.log(`[Calendar] calendar_events_new table exists, useNewTable = true`);
    } catch (e: any) {
      // Table doesn't exist, use legacy table
      useNewTable = false;
      console.log(`[Calendar] calendar_events_new table does not exist (${e.message}), useNewTable = false`);
    }
    
    let events: any[] = [];
    
    // Check if templates table exists - if so, generate instances on-demand
    let templatesTableExists = false;
    try {
      await db.execute(sql`SELECT 1 FROM calendar_event_templates LIMIT 1`);
      templatesTableExists = true;
      console.log(`[Calendar] Templates table exists, will use template-based generation`);
    } catch (err: any) {
      templatesTableExists = false;
      console.log(`[Calendar] Templates table does not exist (${err.message}), falling back to pre-generated events`);
    }
    
    if (templatesTableExists) {
      // Generate instances from templates on-demand (scalable, works indefinitely)
      console.log(`[Calendar] Generating instances from templates for date range`);
      
      // Get user timezone
      const userResult = await db.execute(sql`
        SELECT timezone FROM users WHERE id = ${userId}::uuid
      `);
      const userTimezone = (userResult.rows[0] as any)?.timezone || 'America/New_York';
      
      // Fetch templates for this user
      // Note: We want templates that are active during ANY part of the requested range
      // A template is active if: (start_date IS NULL OR start_date <= end) AND (end_date IS NULL OR end_date >= start)
      const startDateStr = start.toISOString().split('T')[0];
      const endDateStr = end.toISOString().split('T')[0];
      
      const templates = await db.execute(sql`
        SELECT 
          id, course_id, event_type, day_of_week,
          start_time_local, end_time_local, location, is_movable, metadata,
          start_date, end_date
        FROM calendar_event_templates
        WHERE user_id = ${userId}::uuid
        AND (start_date IS NULL OR start_date <= ${endDateStr}::date)
        AND (end_date IS NULL OR end_date >= ${startDateStr}::date)
      `);
      
      console.log(`[Calendar] Found ${templates.rows.length} templates for date range ${startDateStr} to ${endDateStr}`);
      if (templates.rows.length > 0) {
        console.log(`[Calendar] Sample template:`, {
          day_of_week: templates.rows[0].day_of_week,
          start_date: templates.rows[0].start_date,
          end_date: templates.rows[0].end_date,
          event_type: templates.rows[0].event_type,
        });
      }
      
      // Generate instances for each template in the date range
      const startZ = DateTime.fromJSDate(start).setZone(userTimezone).startOf('day');
      const endZ = DateTime.fromJSDate(end).setZone(userTimezone).startOf('day');
      
      for (const template of templates.rows as any[]) {
        const dayOfWeek = template.day_of_week; // 0=Sun, 1=Mon, ..., 6=Sat
        const isoDow = dayOfWeek === 0 ? 7 : dayOfWeek; // Convert to ISO: Mon=1..Sun=7
        
        // Determine effective date range for this template
        const templateStartDate = template.start_date 
          ? DateTime.fromISO(template.start_date).setZone(userTimezone).startOf('day')
          : startZ;
        const templateEndDate = template.end_date
          ? DateTime.fromISO(template.end_date).setZone(userTimezone).startOf('day')
          : endZ;
        
        // Use the intersection of requested range and template's valid range
        const effectiveStart = templateStartDate > startZ ? templateStartDate : startZ;
        const effectiveEnd = templateEndDate < endZ ? templateEndDate : endZ;
        
        // Iterate through each day in the effective range
        for (let d = effectiveStart; d <= effectiveEnd; d = d.plus({ days: 1 })) {
          if (d.weekday !== isoDow) continue;
          
          // Parse time strings (HH:mm:ss)
          const [sh, sm] = template.start_time_local.split(':').map(Number);
          const [eh, em] = template.end_time_local.split(':').map(Number);
          
          const startZt = d.set({ hour: sh || 0, minute: sm || 0, second: 0 });
          const endZt = d.set({ hour: eh || 0, minute: em || 0, second: 0 });
          
          // Convert to UTC Date objects
          const startUtc = new Date(startZt.toUTC().toISO());
          const endUtc = new Date(endZt.toUTC().toISO());
          
          // Get title from metadata or generate default
          const metadata = template.metadata || {};
          const title = metadata.title || `${template.event_type}: Course`;
          
          // Check if this template instance has been overridden by a direct event
          // We'll check this after fetching direct events to avoid duplicates
          const instanceId = `${template.id}-${d.toISODate()}`;
          
          events.push({
            id: instanceId, // Unique ID per instance
            title,
            startAt: startUtc,
            endAt: endUtc,
            eventType: template.event_type,
            isMovable: template.is_movable || false,
            metadata: { 
              ...metadata, 
              location: template.location,
              templateId: template.id,
              templateInstanceDate: d.toISODate()
            },
          });
        }
      }
      
      console.log(`[Calendar] Generated ${events.length} instances from templates`);
      console.log(`[Calendar] useNewTable = ${useNewTable}, will ${useNewTable ? 'query' : 'skip'} direct events`);
      
      // Also include any direct events from calendar_events_new (not from templates)
      // These are manually created events like test events or user-created Focus sessions
      if (useNewTable) {
        console.log(`[Calendar] Querying direct events from calendar_events_new for user ${userId}`);
        const directEvents = await db
          .select({
            id: schema.calendarEventsNew.id,
            title: schema.calendarEventsNew.title,
            startAt: schema.calendarEventsNew.startAt,
            endAt: schema.calendarEventsNew.endAt,
            eventType: schema.calendarEventsNew.eventType,
            isMovable: schema.calendarEventsNew.isMovable,
            linkedAssignmentId: schema.calendarEventsNew.linkedAssignmentId, // ✅ PRIORITY 2: For deferral tracking
            metadata: schema.calendarEventsNew.metadata,
          })
          .from(schema.calendarEventsNew)
          .where(
            and(
              eq(schema.calendarEventsNew.userId, userId)
              // Note: We're not filtering by date range here to catch all direct events
              // The date filtering happens below
            )
          );
        
        console.log(`[Calendar] Found ${directEvents.length} direct events from calendar_events_new (before date filter)`);
        if (directEvents.length > 0) {
          console.log(`[Calendar] Direct events (raw):`, directEvents.map(e => ({
            id: e.id,
            title: e.title,
            startAt: e.startAt instanceof Date ? e.startAt.toISOString() : e.startAt,
            endAt: e.endAt instanceof Date ? e.endAt.toISOString() : e.endAt,
            eventType: e.eventType,
            isMovable: e.isMovable
          })));
          console.log(`[Calendar] Date range: ${start.toISOString()} to ${end.toISOString()}`);
        }
        
        // Track template instances that have been overridden by direct events
        const overriddenTemplateInstances = new Set<string>();
        
        // Add direct events to the list
        directEvents.forEach(evt => {
          const startDate = evt.startAt instanceof Date ? evt.startAt : new Date(evt.startAt);
          const endDate = evt.endAt instanceof Date ? evt.endAt : new Date(evt.endAt);
          
          console.log(`[Calendar] Checking direct event: ${evt.title}, start: ${startDate.toISOString()}, range: ${start.toISOString()} to ${end.toISOString()}`);
          
          // Check if this event was moved from a template instance
          const evtMetadata = evt.metadata as any || {};
          if (evtMetadata.movedFromTemplate && evtMetadata.originalEventId) {
            // Mark this template instance as overridden
            overriddenTemplateInstances.add(evtMetadata.originalEventId);
            console.log(`[Calendar] Direct event overrides template instance: ${evtMetadata.originalEventId}`);
          }
          
          // Only add if it's within the requested date range
          if (startDate >= start && startDate <= end) {
            console.log(`[Calendar] ✓ Adding direct event: ${evt.title} at ${startDate.toISOString()}`);
            events.push({
              id: evt.id,
              title: evt.title,
              startAt: startDate,
              endAt: endDate,
              eventType: evt.eventType,
              isMovable: evt.isMovable ?? false,
              linkedAssignmentId: evt.linkedAssignmentId, // PRIORITY 2: For deferral tracking
              metadata: evt.metadata,
            });
          } else {
            console.log(`[Calendar] ✗ Skipping direct event ${evt.title} - outside date range`);
            console.log(`[Calendar]   Event start: ${startDate.toISOString()}, Range: ${start.toISOString()} to ${end.toISOString()}`);
          }
        });
        
        // Remove template instances that have been overridden
        if (overriddenTemplateInstances.size > 0) {
          const beforeCount = events.length;
          events = events.filter(evt => {
            const evtMetadata = evt.metadata as any || {};
            const instanceId = evtMetadata.templateId && evtMetadata.templateInstanceDate
              ? `${evtMetadata.templateId}-${evtMetadata.templateInstanceDate}`
              : null;
            
            // Skip if this template instance was overridden
            if (instanceId && overriddenTemplateInstances.has(instanceId)) {
              console.log(`[Calendar] Skipping overridden template instance: ${instanceId}`);
              return false;
            }
            
            // Also check if the event ID itself matches an overridden instance
            return !overriddenTemplateInstances.has(evt.id);
          });
          console.log(`[Calendar] Filtered out ${beforeCount - events.length} overridden template instances`);
        }
        
        // Deduplicate events: if multiple events have the same start time, end time, and title, keep only one
        const eventKeyMap = new Map<string, any>();
        for (const evt of events) {
          const evtStart = evt.startAt instanceof Date ? evt.startAt : new Date(evt.startAt);
          const evtEnd = evt.endAt instanceof Date ? evt.endAt : new Date(evt.endAt);
          const key = `${evt.title || 'Untitled'}-${evtStart.getTime()}-${evtEnd.getTime()}`;
          
          // Only keep the first occurrence of each duplicate
          if (!eventKeyMap.has(key)) {
            eventKeyMap.set(key, evt);
          } else {
            console.log(`[Calendar] Deduplicating event: ${evt.title} at ${evtStart.toISOString()}`);
          }
        }
        events = Array.from(eventKeyMap.values());
        console.log(`[Calendar] After deduplication: ${events.length} events`);
        
        // Filter by date range (for template-generated events)
        events = events.filter((evt) => {
          const evtStart = evt.startAt instanceof Date ? evt.startAt : new Date(evt.startAt);
          return evtStart >= start && evtStart < end;
        });
        
        console.log(`[Calendar] Total events after adding direct events and date filtering: ${events.length}`);
      }
    } else if (useNewTable) {
      // Query calendar_events_new (pre-generated instances)
      const allEventsForUser = await db
        .select({
          id: schema.calendarEventsNew.id,
          title: schema.calendarEventsNew.title,
          startAt: schema.calendarEventsNew.startAt,
          endAt: schema.calendarEventsNew.endAt,
          eventType: schema.calendarEventsNew.eventType,
          isMovable: schema.calendarEventsNew.isMovable,
          linkedAssignmentId: schema.calendarEventsNew.linkedAssignmentId, // PRIORITY 2: Needed for deferral tracking
          metadata: schema.calendarEventsNew.metadata,
        })
        .from(schema.calendarEventsNew)
        .where(eq(schema.calendarEventsNew.userId, userId));
      
      console.log(`[Calendar] Found ${allEventsForUser.length} total events for user ${userId} (no date filter)`);
      
      // Filter by date range
      events = allEventsForUser.filter((evt) => {
        const evtStart = new Date(evt.startAt);
        return evtStart >= start && evtStart <= end;
      });
      
      // Deduplicate events: if multiple events have the same start time, end time, and title, keep only one
      const eventKeyMap = new Map<string, any>();
      for (const evt of events) {
        const evtStart = evt.startAt instanceof Date ? evt.startAt : new Date(evt.startAt);
        const evtEnd = evt.endAt instanceof Date ? evt.endAt : new Date(evt.endAt);
        const key = `${evt.title || 'Untitled'}-${evtStart.getTime()}-${evtEnd.getTime()}`;
        
        // Only keep the first occurrence of each duplicate
        if (!eventKeyMap.has(key)) {
          eventKeyMap.set(key, evt);
        } else {
          console.log(`[Calendar] Deduplicating event: ${evt.title} at ${evtStart.toISOString()}`);
        }
      }
      events = Array.from(eventKeyMap.values());
      
      console.log(`[Calendar] Filtered to ${events.length} events in date range (after deduplication)`);
    } else {
      // Fallback to legacy calendar_events
      events = await db
        .select({
          id: schema.calendarEvents.id,
          title: schema.calendarEvents.title,
          startAt: schema.calendarEvents.startTime,
          endAt: schema.calendarEvents.endTime,
          eventType: schema.calendarEvents.type,
          isMovable: schema.calendarEvents.isMovable,
          metadata: schema.calendarEvents.metadata,
        })
        .from(schema.calendarEvents)
        .where(
          and(
            eq(schema.calendarEvents.userId, userId),
            gte(schema.calendarEvents.startTime, start),
            lte(schema.calendarEvents.startTime, end)
          ) as any
        );
    }
    
    // Check which events have checklists
    const eventIdsWithLinkedAssignments = events
      .filter(e => (e as any).linkedAssignmentId)
      .map(e => (e as any).linkedAssignmentId);
    
    const checklistsMap = new Map<string, string>(); // assignmentId -> checklistId
    if (eventIdsWithLinkedAssignments.length > 0) {
      console.log(`[Calendar] Checking for checklists for ${eventIdsWithLinkedAssignments.length} linked assignments`);
      const checklists = await db
        .select({
          assignmentId: schema.assignmentChecklists.assignmentId,
          checklistId: schema.assignmentChecklists.id,
        })
        .from(schema.assignmentChecklists);
      
      console.log(`[Calendar] Found ${checklists.length} checklists in database`);
      checklists.forEach(c => {
        checklistsMap.set(c.assignmentId, c.checklistId);
      });
    }
    
    // Transform to FullCalendar format
    // FullCalendar expects ISO strings or Date objects for start/end
    const formattedEvents = events.map((evt) => {
      const startDate = evt.startAt instanceof Date ? evt.startAt : new Date(evt.startAt);
      const endDate = evt.endAt instanceof Date ? evt.endAt : new Date(evt.endAt);
      const linkedAssignmentId = (evt as any).linkedAssignmentId;
      const hasChecklist = linkedAssignmentId ? checklistsMap.has(linkedAssignmentId) : false;
      const checklistId = linkedAssignmentId ? checklistsMap.get(linkedAssignmentId) : undefined;
      
      return {
        id: evt.id,
        title: evt.title,
        start: startDate.toISOString(), // FullCalendar prefers ISO strings
        end: endDate.toISOString(),
        extendedProps: {
          eventType: evt.eventType, // Frontend expects 'eventType', not 'type'
          type: evt.eventType, // Keep 'type' for backward compatibility
          isMovable: evt.isMovable ?? false,
          linkedAssignmentId, // PRIORITY 2: For deferral tracking
          hasChecklist, // NEW: Flag to show clipboard icon
          checklistId, // NEW: For opening checklist modal
          metadata: evt.metadata,
        },
      };
    });
    
    console.log(`[Calendar] Returning ${formattedEvents.length} formatted events`);
    const eventsWithChecklists = formattedEvents.filter(e => e.extendedProps?.hasChecklist);
    console.log(`[Calendar] Events with checklists: ${eventsWithChecklists.length}`);
    if (eventsWithChecklists.length > 0) {
      console.log(`[Calendar] First event with checklist:`, JSON.stringify(eventsWithChecklists[0], null, 2));
    }
    if (formattedEvents.length > 0) {
      console.log(`[Calendar] First event: ${JSON.stringify(formattedEvents[0], null, 2)}`);
    }
    
    // Log all event IDs to help debug
    console.log(`[Calendar] Event IDs:`, formattedEvents.map(e => ({ id: e.id, title: e.title, start: e.start })));
    
    return c.json({ ok: true, events: formattedEvents });
  } catch (e: any) {
    console.error('Calendar events fetch error:', e);
    return c.json({ error: e.message || 'Failed to fetch events' }, 500);
  }
});

calendarRoute.post('/event-drop', async (c) => {
  try {
    const userId = await getUserId(c);
    const body = await c.req.json<{ id: string; start: string; end: string }>();
    
    if (!body.id || !body.start || !body.end) {
      return c.json({ error: 'Missing required fields: id, start, end' }, 400);
    }
    
    console.log(`[Calendar Event Drop] User ${userId} moving event ${body.id} to ${body.start} - ${body.end}`);
    
    // Fetch the event to check if it's movable and get linked assignment
    const [event] = await db
      .select()
      .from(schema.calendarEventsNew)
      .where(and(
        eq(schema.calendarEventsNew.id, body.id),
        eq(schema.calendarEventsNew.userId, userId)
      ))
      .limit(1);
    
    if (!event) {
      return c.json({ error: 'Event not found' }, 404);
    }
    
    if (!event.isMovable) {
      return c.json({ error: 'This event cannot be moved' }, 400);
    }
    
    const newStartAt = new Date(body.start);
    const newEndAt = new Date(body.end);
    const originalStartAt = new Date(event.startAt);
    
    // PRIORITY 2: Validate against due date if this is a Focus block with linked assignment
    if (event.linkedAssignmentId) {
      const [assignment] = await db
        .select()
        .from(schema.assignments)
        .where(eq(schema.assignments.id, event.linkedAssignmentId))
        .limit(1);
      
      if (assignment && assignment.dueDate) {
        const dueDate = new Date(assignment.dueDate);
        
        // Calculate time differences in milliseconds
        const originalDaysBeforeDue = (dueDate.getTime() - originalStartAt.getTime()) / (1000 * 60 * 60 * 24);
        const newHoursBeforeDue = (dueDate.getTime() - newStartAt.getTime()) / (1000 * 60 * 60);
        
        console.log(`[Calendar Event Drop] Due date validation:`, {
          originalDaysBeforeDue,
          newHoursBeforeDue,
          dueDate: dueDate.toISOString(),
          originalStart: originalStartAt.toISOString(),
          newStart: newStartAt.toISOString()
        });
        
        // NEW RULE: Block if originally scheduled 3+ days out but now moving to within 24 hours of due date
        // This prevents last-minute cramming when user had planned ahead
        if (originalDaysBeforeDue >= 3 && newHoursBeforeDue < 24) {
          return c.json({ 
            error: `⚠️ Whoa there! This was scheduled ${Math.round(originalDaysBeforeDue)} days before the due date. Moving it to the last minute isn't going to help you do your best work. Keep it where you planned it!`,
            dueDate: dueDate.toISOString(),
            originalStart: originalStartAt.toISOString(),
            blocked: true
          }, 400);
        }
        
        // Also block moves past the due date entirely
        if (newEndAt > dueDate) {
          return c.json({ 
            error: `Cannot move work session past the assignment due date (${dueDate.toLocaleDateString()})`,
            dueDate: dueDate.toISOString()
          }, 400);
        }
      }
    }
    
    // Update the event in the database
    const [updatedEvent] = await db
      .update(schema.calendarEventsNew)
      .set({
        startAt: newStartAt,
        endAt: newEndAt,
        updatedAt: new Date()
      })
      .where(eq(schema.calendarEventsNew.id, body.id))
      .returning();
    
    console.log(`[Calendar Event Drop] Event ${body.id} updated successfully`);
    
    // PRIORITY 2: Track deferral if this is a Focus block
    let deferralInfo = null;
    if (event.eventType === 'Focus' && event.linkedAssignmentId) {
      try {
        const ADHDGuardian = await import('../lib/adhd-guardian');
        const result = await ADHDGuardian.default.trackDeferral(
          userId,
          event.linkedAssignmentId,
          new Date(event.startAt),
          newStartAt
        );
        
        deferralInfo = {
          deferralCount: result.deferralCount,
          isStuck: result.isStuck,
          linkedAssignmentId: event.linkedAssignmentId
        };
        
        console.log(`[Calendar Event Drop] Deferral tracked: count=${result.deferralCount}, stuck=${result.isStuck}`);
      } catch (deferralError) {
        console.error('[Calendar Event Drop] Failed to track deferral:', deferralError);
        // Don't fail the whole request if deferral tracking fails
      }
    }
    
    return c.json({ 
      ok: true, 
      event: {
        id: updatedEvent.id,
        startAt: updatedEvent.startAt.toISOString(),
        endAt: updatedEvent.endAt.toISOString()
      },
      deferral: deferralInfo
    });
  } catch (error: any) {
    console.error('[Calendar Event Drop] Error:', error);
    return c.json({ error: error.message || 'Failed to update event' }, 500);
  }
});

// DELETE /api/calendar/events/:id
// Deletes a calendar event (only if user owns it and it's movable)
calendarRoute.delete('/events/:id', async (c) => {
  try {
    const userId = await getUserId(c);
    const eventId = c.req.param('id');
    
    console.log(`[Calendar] Delete request for event ${eventId} by user ${userId}`);
    
    // Fetch event to verify ownership and movability
    const event = await db.query.calendarEventsNew.findFirst({
      where: and(
        eq(schema.calendarEventsNew.id, eventId),
        eq(schema.calendarEventsNew.userId, userId)
      )
    });
    
    if (!event) {
      console.log(`[Calendar] Event ${eventId} not found or user ${userId} doesn't own it`);
      return c.json({ error: 'Event not found' }, 404);
    }
    
    if (!event.isMovable) {
      console.log(`[Calendar] Event ${eventId} is not movable, deletion denied`);
      return c.json({ error: 'Cannot delete non-movable events (Classes, DUE markers, etc.)' }, 403);
    }
    
    // Check if this event has any linked transition buffers
    const allUserEvents = await db.query.calendarEventsNew.findMany({
      where: eq(schema.calendarEventsNew.userId, userId)
    });
    
    const linkedBuffers = allUserEvents.filter(evt => {
      const metadata = evt.metadata as any;
      return metadata?.transitionTax && metadata?.linkedToEvent === eventId;
    });
    
    // Check if this event is linked to an assignment
    const linkedAssignmentId = (event.metadata as any)?.linkedAssignmentId;
    let deletedAssignment = false;
    
    if (linkedAssignmentId) {
      console.log(`[Calendar] Event ${eventId} linked to assignment ${linkedAssignmentId}, checking for deletion...`);
      
      // Check if there are other calendar events for this assignment
      const otherEventsForAssignment = allUserEvents.filter(evt => {
        if (evt.id === eventId) return false; // Skip the event we're deleting
        const metadata = evt.metadata as any;
        return metadata?.linkedAssignmentId === linkedAssignmentId;
      });
      
      if (otherEventsForAssignment.length === 0) {
        // This is the LAST/ONLY event for this assignment - delete the assignment
        await db.delete(schema.assignments)
          .where(and(
            eq(schema.assignments.id, linkedAssignmentId),
            eq(schema.assignments.userId, userId)
          ));
        console.log(`[Calendar] ✅ Deleted orphaned assignment ${linkedAssignmentId} (no other events)`);
        deletedAssignment = true;
      } else {
        console.log(`[Calendar] ℹ️ Assignment ${linkedAssignmentId} has ${otherEventsForAssignment.length} other event(s), keeping it`);
      }
    }
    
    // Delete the main event
    await db.delete(schema.calendarEventsNew)
      .where(eq(schema.calendarEventsNew.id, eventId));
    
    console.log(`[Calendar] Successfully deleted event ${eventId}`);
    
    // Also delete any linked transition buffers
    if (linkedBuffers.length > 0) {
      for (const buffer of linkedBuffers) {
        await db.delete(schema.calendarEventsNew)
          .where(eq(schema.calendarEventsNew.id, buffer.id));
        console.log(`[Calendar] Also deleted linked buffer ${buffer.id}`);
      }
    }
    
    return c.json({ 
      ok: true, 
      deletedId: eventId,
      deletedBuffers: linkedBuffers.length,
      deletedAssignment 
    });
  } catch (error: any) {
    console.error('[Calendar] Delete event error:', error);
    return c.json({ error: error.message || 'Failed to delete event' }, 500);
  }
});

// PUT /api/calendar/events/:id
// Updates a calendar event with validation and conflict resolution
calendarRoute.put('/events/:id', async (c) => {
  try {
    const userId = await getUserId(c);
    const eventId = c.req.param('id');
    const body = await c.req.json();
    
    const { title, startAt, endAt } = body;
    
    console.log(`[Calendar Edit] Update request for event ${eventId} by user ${userId}`);
    
    // Validate inputs
    if (!title || !startAt || !endAt) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    const newStart = new Date(startAt);
    const newEnd = new Date(endAt);
    
    if (newEnd <= newStart) {
      return c.json({ error: 'End time must be after start time' }, 400);
    }
    
    // Fetch event to verify ownership
    const event = await db.query.calendarEventsNew.findFirst({
      where: and(
        eq(schema.calendarEventsNew.id, eventId),
        eq(schema.calendarEventsNew.userId, userId)
      )
    });
    
    if (!event) {
      console.log(`[Calendar Edit] Event ${eventId} not found or user ${userId} doesn't own it`);
      return c.json({ error: 'Event not found' }, 404);
    }
    
    if (!event.isMovable) {
      console.log(`[Calendar Edit] Event ${eventId} is not movable, edit denied`);
      return c.json({ error: 'Cannot edit non-movable events (Classes, DUE markers, etc.)' }, 403);
    }
    
    // ANTI-CRAMMING VALIDATION (if linked to assignment)
    const linkedAssignmentId = (event.metadata as any)?.linkedAssignmentId;
    if (linkedAssignmentId) {
      const assignment = await db.query.assignments.findFirst({
        where: eq(schema.assignments.id, linkedAssignmentId)
      });
      
      if (assignment?.dueDate) {
        const dueDate = assignment.dueDate;
        const originalDaysBeforeDue = (dueDate.getTime() - event.startAt.getTime()) / (1000 * 60 * 60 * 24);
        const newDaysBeforeDue = (dueDate.getTime() - newStart.getTime()) / (1000 * 60 * 60 * 24);
        
        if (originalDaysBeforeDue >= 3 && newDaysBeforeDue < 1) {
          console.log(`[Calendar Edit] Anti-cramming rule violated: trying to move from ${Math.round(originalDaysBeforeDue)} days early to ${Math.round(newDaysBeforeDue)} days early`);
          return c.json({
            error: `Cannot move event to within 24h of due date when originally scheduled ${Math.round(originalDaysBeforeDue)} days early`,
            dueDate: dueDate.toISOString()
          }, 400);
        }
      }
    }
    
    // CONFLICT DETECTION
    const allEvents = await db.query.calendarEventsNew.findMany({
      where: eq(schema.calendarEventsNew.userId, userId)
    });
    
    const conflictingEvents = allEvents.filter(evt => {
      if (evt.id === eventId) return false; // Skip self
      
      const evtStart = evt.startAt.getTime();
      const evtEnd = evt.endAt.getTime();
      const newStartTime = newStart.getTime();
      const newEndTime = newEnd.getTime();
      
      // Check overlap (skip Office Hours - can be overridden)
      if (evt.eventType === 'OfficeHours') return false;
      
      return evtStart < newEndTime && evtEnd > newStartTime;
    });
    
    // AUTO-RESCHEDULE CONFLICTS (move to next available slot after this event)
    if (conflictingEvents.length > 0) {
      console.log(`[Calendar Edit] Found ${conflictingEvents.length} conflicts, rescheduling...`);
      
      for (const conflict of conflictingEvents) {
        const duration = conflict.endAt.getTime() - conflict.startAt.getTime();
        const nextSlotStart = new Date(newEnd.getTime() + 15 * 60 * 1000); // 15 min buffer
        const nextSlotEnd = new Date(nextSlotStart.getTime() + duration);
        
        await db.update(schema.calendarEventsNew)
          .set({
            startAt: nextSlotStart,
            endAt: nextSlotEnd
          })
          .where(eq(schema.calendarEventsNew.id, conflict.id));
        
        console.log(`[Calendar Edit] Moved "${conflict.title}" to ${nextSlotStart.toISOString()}`);
      }
    }
    
    // UPDATE THE EVENT
    const [updatedEvent] = await db.update(schema.calendarEventsNew)
      .set({
        title,
        startAt: newStart,
        endAt: newEnd
      })
      .where(eq(schema.calendarEventsNew.id, eventId))
      .returning();
    
    console.log(`[Calendar Edit] Successfully updated event ${eventId}`);
    
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'calendar.ts:743',message:'Before assignment sync check',data:{linkedAssignmentId_topLevel:event.linkedAssignmentId,linkedAssignmentId_metadata:(event.metadata as any)?.linkedAssignmentId,eventTitle:title,eventMetadata:event.metadata},timestamp:Date.now(),sessionId:'debug-session',runId:'title-sync-fixed',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // UPDATE LINKED ASSIGNMENT (if exists and title changed)
    // FIX: linkedAssignmentId is a top-level database column, not in metadata
    const actualLinkedAssignmentId = event.linkedAssignmentId || (event.metadata as any)?.linkedAssignmentId;
    
    if (actualLinkedAssignmentId) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'calendar.ts:751',message:'Inside linkedAssignmentId check',data:{actualLinkedAssignmentId,userId},timestamp:Date.now(),sessionId:'debug-session',runId:'title-sync-fixed',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      
      const assignment = await db.query.assignments.findFirst({
        where: and(
          eq(schema.assignments.id, actualLinkedAssignmentId),
          eq(schema.assignments.userId, userId)
        )
      });
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'calendar.ts:758',message:'Assignment query result',data:{found:!!assignment,assignmentId:assignment?.id,currentTitle:assignment?.title},timestamp:Date.now(),sessionId:'debug-session',runId:'title-sync-fixed',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      
      if (assignment) {
        // Extract assignment title from event title
        // Remove "Work on: " prefix and session numbers like "(Session 1)"
        let newAssignmentTitle = title
          .replace(/^Work on:\s*/, '')
          .replace(/\s*\(Session\s+\d+\)$/i, '')
          .trim();
        
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'calendar.ts:769',message:'Title extraction result',data:{originalTitle:title,extractedTitle:newAssignmentTitle,currentAssignmentTitle:assignment.title,willUpdate:newAssignmentTitle!==assignment.title},timestamp:Date.now(),sessionId:'debug-session',runId:'title-sync-fixed',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        
        if (newAssignmentTitle !== assignment.title) {
          const result = await db.update(schema.assignments)
            .set({
              title: newAssignmentTitle,
            })
            .where(eq(schema.assignments.id, actualLinkedAssignmentId))
            .returning();
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'calendar.ts:782',message:'Assignment update result',data:{rowsUpdated:result.length,updatedTitle:result[0]?.title},timestamp:Date.now(),sessionId:'debug-session',runId:'title-sync-fixed',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          
          console.log(`[Calendar Edit] ✅ Updated assignment title from "${assignment.title}" to "${newAssignmentTitle}"`);
        } else {
          console.log(`[Calendar Edit] Assignment title unchanged: "${assignment.title}"`);
        }
      } else {
        console.log(`[Calendar Edit] ⚠️ Linked assignment ${actualLinkedAssignmentId} not found or doesn't belong to user`);
      }
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/70ed254e-2018-4d82-aafb-fe6aca7caaca',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'calendar.ts:795',message:'No linkedAssignmentId found',data:{eventId,eventTitle:title,topLevelId:event.linkedAssignmentId,metadataId:(event.metadata as any)?.linkedAssignmentId},timestamp:Date.now(),sessionId:'debug-session',runId:'title-sync-fixed',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    }
    
    // AUTO-MOVE LINKED TRANSITION BUFFER
    const linkedBuffer = allEvents.find(evt => {
      const metadata = evt.metadata as any;
      return metadata?.transitionTax && metadata?.linkedToEvent === eventId;
    });
    
    if (linkedBuffer) {
      const oldEventEnd = event.endAt;
      const newEventEnd = newEnd;
      const timeDelta = newEventEnd.getTime() - oldEventEnd.getTime();
      
      const newBufferStart = new Date(linkedBuffer.startAt.getTime() + timeDelta);
      const newBufferEnd = new Date(linkedBuffer.endAt.getTime() + timeDelta);
      
      await db.update(schema.calendarEventsNew)
        .set({
          startAt: newBufferStart,
          endAt: newBufferEnd
        })
        .where(eq(schema.calendarEventsNew.id, linkedBuffer.id));
      
      console.log(`[Calendar Edit] Auto-moved linked buffer to ${newBufferStart.toISOString()}`);
    }
    
    return c.json({
      ok: true,
      event: updatedEvent,
      movedConflicts: conflictingEvents.length,
      movedBuffer: !!linkedBuffer
    });
  } catch (error: any) {
    console.error('[Calendar Edit] Error:', error);
    return c.json({ error: error.message || 'Failed to update event' }, 500);
  }
});
