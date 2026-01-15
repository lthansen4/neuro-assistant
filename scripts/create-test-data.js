const pg = require('pg');

const pool = new pg.Pool({
  connectionString: 'postgresql://postgres.dprpbawhufbdicflasph:JDeh2oVytjgiglTN@aws-0-us-west-2.pooler.supabase.com:6543/postgres'
});

const userId = 'f117b49f-54de-4bc1-b1b5-87f45b2a0503';

async function createTestData() {
  try {
    console.log('🧪 Creating test data for rebalancing engine...\n');

    // Get the Math course ID
    const mathCourse = await pool.query(`
      SELECT id FROM courses 
      WHERE user_id = $1 
      AND name ILIKE '%math%'
      LIMIT 1
    `, [userId]);

    if (mathCourse.rows.length === 0) {
      console.error('❌ No Math course found. Please upload syllabus first.');
      await pool.end();
      return;
    }

    const courseId = mathCourse.rows[0].id;
    console.log(`✅ Found Math course: ${courseId}\n`);

    // Scenario 1: CONFLICTING EVENTS (2 Focus blocks at same time)
    console.log('📅 Scenario 1: Creating conflicting Focus blocks...');
    const conflict1Start = new Date('2026-01-15T14:00:00Z'); // Tomorrow at 2 PM
    const conflict1End = new Date('2026-01-15T15:30:00Z');

    await pool.query(`
      INSERT INTO calendar_events_new (user_id, course_id, title, event_type, start_at, end_at, is_movable, metadata)
      VALUES 
        ($1, $2, 'Focus: Math Problem Set 1', 'Focus', $3, $4, true, '{"test": "conflict1a"}'),
        ($1, $2, 'Focus: Math Problem Set 2', 'Focus', $3, $4, true, '{"test": "conflict1b"}')
    `, [userId, courseId, conflict1Start, conflict1End]);
    console.log('  ✅ Created 2 conflicting Focus blocks (same time slot)\n');

    // Scenario 2: CRAMMING (3 Focus blocks day before due date)
    console.log('📅 Scenario 2: Creating cramming scenario...');
    const crammingDay = new Date('2026-01-19T08:00:00Z'); // Day before HW2 due
    
    await pool.query(`
      INSERT INTO calendar_events_new (user_id, course_id, title, event_type, start_at, end_at, is_movable, metadata)
      VALUES 
        ($1, $2, 'Focus: Last Minute Homework 2', 'Focus', $3, $4, true, '{"test": "cramming1"}'),
        ($1, $2, 'Focus: More Homework 2', 'Focus', $5, $6, true, '{"test": "cramming2"}'),
        ($1, $2, 'Focus: Even More Homework 2', 'Focus', $7, $8, true, '{"test": "cramming3"}')
    `, [
      userId, courseId,
      new Date('2026-01-19T08:00:00Z'), new Date('2026-01-19T10:00:00Z'),
      new Date('2026-01-19T10:00:00Z'), new Date('2026-01-19T12:00:00Z'),
      new Date('2026-01-19T14:00:00Z'), new Date('2026-01-19T16:00:00Z')
    ]);
    console.log('  ✅ Created cramming scenario (3 Focus blocks day before due date)\n');

    // Scenario 3: POOR TIMING (late night and early morning work)
    console.log('📅 Scenario 3: Creating poor timing scenario...');
    
    await pool.query(`
      INSERT INTO calendar_events_new (user_id, course_id, title, event_type, start_at, end_at, is_movable, metadata)
      VALUES 
        ($1, $2, 'Focus: Late Night Cramming', 'Focus', $3, $4, true, '{"test": "latenight"}'),
        ($1, $2, 'Focus: Early Morning Study', 'Focus', $5, $6, true, '{"test": "earlymorning"}')
    `, [
      userId, courseId,
      new Date('2026-01-16T04:00:00Z'), new Date('2026-01-16T05:30:00Z'), // 10 PM - 11:30 PM local
      new Date('2026-01-17T11:00:00Z'), new Date('2026-01-17T12:30:00Z')  // 5 AM - 6:30 AM local
    ]);
    console.log('  ✅ Created poor timing blocks (late night + early morning)\n');

    // Scenario 4: OVERLOADED DAY (6+ hours of work)
    console.log('📅 Scenario 4: Creating overloaded day...');
    const overloadDay = new Date('2026-01-22T14:00:00Z');
    
    await pool.query(`
      INSERT INTO calendar_events_new (user_id, course_id, title, event_type, start_at, end_at, is_movable, metadata)
      VALUES 
        ($1, $2, 'Focus: Math Marathon 1', 'Focus', $3, $4, true, '{"test": "overload1"}'),
        ($1, $2, 'Focus: Math Marathon 2', 'Focus', $5, $6, true, '{"test": "overload2"}'),
        ($1, $2, 'Focus: Math Marathon 3', 'Focus', $7, $8, true, '{"test": "overload3"}'),
        ($1, $2, 'Focus: Math Marathon 4', 'Focus', $9, $10, true, '{"test": "overload4"}')
    `, [
      userId, courseId,
      new Date('2026-01-22T14:00:00Z'), new Date('2026-01-22T16:00:00Z'), // 8 AM - 10 AM local
      new Date('2026-01-22T16:00:00Z'), new Date('2026-01-22T18:00:00Z'), // 10 AM - 12 PM local
      new Date('2026-01-22T19:00:00Z'), new Date('2026-01-22T21:00:00Z'), // 1 PM - 3 PM local
      new Date('2026-01-22T21:00:00Z'), new Date('2026-01-22T23:00:00Z')  // 3 PM - 5 PM local
    ]);
    console.log('  ✅ Created overloaded day (8 hours of work)\n');

    // Scenario 5: CONFLICT WITH CLASS (Focus block during class time)
    console.log('📅 Scenario 5: Creating conflict with class...');
    
    await pool.query(`
      INSERT INTO calendar_events_new (user_id, course_id, title, event_type, start_at, end_at, is_movable, metadata)
      VALUES 
        ($1, $2, 'Focus: During Class Time', 'Focus', $3, $4, true, '{"test": "classconflict"}')
    `, [
      userId, courseId,
      new Date('2026-01-20T19:00:00Z'), new Date('2026-01-20T20:00:00Z') // Monday 1 PM (class time)
    ]);
    console.log('  ✅ Created Focus block during class time\n');

    // Scenario 6: SUBOPTIMAL ENERGY (deep work during typical low-energy hours)
    console.log('📅 Scenario 6: Creating energy mismatch...');
    
    await pool.query(`
      INSERT INTO calendar_events_new (user_id, course_id, title, event_type, start_at, end_at, is_movable, metadata)
      VALUES 
        ($1, $2, 'Focus: Right After Lunch Dip', 'Focus', $3, $4, true, '{"test": "postlunch"}'),
        ($1, $2, 'Focus: Late Evening Fatigue', 'Focus', $5, $6, true, '{"test": "evening"}')
    `, [
      userId, courseId,
      new Date('2026-01-23T18:30:00Z'), new Date('2026-01-23T20:00:00Z'), // 12:30 PM local (post-lunch dip)
      new Date('2026-01-23T02:00:00Z'), new Date('2026-01-23T03:30:00Z')  // 8 PM local (evening fatigue)
    ]);
    console.log('  ✅ Created energy mismatch blocks\n');

    // Scenario 7: GAP DAYS (days with no work between assignments)
    console.log('📅 Scenario 7: Creating assignment with large gaps...');
    
    // Create a future assignment
    await pool.query(`
      INSERT INTO assignments (user_id, course_id, title, due_date, category, effort_estimate_minutes, status)
      VALUES ($1, $2, 'Test Assignment: Large Project', $3, 'Project', 360, 'Scheduled')
    `, [userId, courseId, new Date('2026-02-10T23:59:00Z')]); // Feb 10 due date
    
    console.log('  ✅ Created assignment with no Focus blocks (gap days)\n');

    // Summary
    console.log('\n🎯 TEST DATA SUMMARY:');
    console.log('=====================');
    console.log('✅ Scenario 1: 2 conflicting Focus blocks (same time)');
    console.log('✅ Scenario 2: Cramming (3 blocks day before due date)');
    console.log('✅ Scenario 3: Poor timing (late night + early morning)');
    console.log('✅ Scenario 4: Overloaded day (8 hours of work)');
    console.log('✅ Scenario 5: Conflict with class time');
    console.log('✅ Scenario 6: Energy mismatches (post-lunch, evening)');
    console.log('✅ Scenario 7: Gap days (assignment without Focus blocks)');
    
    console.log('\n📊 WHAT TO TEST:');
    console.log('================');
    console.log('1. Click "Rebalance" button');
    console.log('2. Check if conflicts are detected and resolved');
    console.log('3. Verify cramming is spread out over multiple days');
    console.log('4. See if poor timing blocks are moved to optimal hours');
    console.log('5. Check overloaded day gets distributed');
    console.log('6. Ensure class conflicts are resolved');
    console.log('7. Verify energy-based optimization suggestions');
    console.log('8. Check if gap days get filled with work');
    
    console.log('\n✨ Ready to test rebalancing! Refresh your calendar now.');

  } catch (e) {
    console.error('❌ Error:', e.message);
    console.error(e.stack);
  } finally {
    await pool.end();
  }
}

createTestData();




