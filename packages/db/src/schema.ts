import {
  pgTable, uuid, text, integer, timestamp, boolean, jsonb, pgEnum, index, numeric, date, time, uniqueIndex, smallint, varchar
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Enums
export const assignmentStatusEnum = pgEnum("assignment_status", ["Inbox","Scheduled","Locked_In","Completed"]);
export const sessionTypeEnum = pgEnum("session_type", ["Focus","Chill"]);
export const eventTypeEnum = pgEnum("event_type", [
  "Class",
  "Work", 
  "OfficeHours",
  "Focus",
  "Chill",
  "Studying",
  "Test",
  "Quiz",
  "Midterm",
  "Final",
  "Homework",
  "DueDate",
  "Other"
]);
export const syllabusParseStatusEnum = pgEnum("syllabus_parse_status", ["queued","processing","succeeded","failed"]);

// Users
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  timezone: text("timezone").notNull().default("UTC"),
  targetStudyRatio: numeric("target_study_ratio", { precision: 4, scale: 2 }).notNull().default("3.00"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  idx_clerk: index("idx_users_clerk").on(t.clerkUserId)
}));

// Courses
export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  professor: text("professor"),
  colorCode: text("color_code"),
  credits: integer("credits").default(3),
  term: text("term"), // e.g., "Fall", "Spring", "Summer" - for Rebalancing Engine
  year: integer("year"), // e.g., 2024, 2025 - for Rebalancing Engine
  scheduleJson: jsonb("schedule_json"),
  officeHoursJson: jsonb("office_hours_json"),
  gradeWeightsJson: jsonb("grade_weights_json"),
  currentGrade: numeric("current_grade", { precision: 5, scale: 2 }), // Migration 0022: Grade Rescue Logic (0-100)
  isMajor: boolean("is_major").default(false).notNull(), // Migration 0022: Major course flag (25% priority boost)
  gradeUpdatedAt: timestamp("grade_updated_at", { withTimezone: true }), // Migration 0022: Last grade update
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  idx_user_name: index("idx_courses_user_name").on(t.userId, t.name)
}));

// Normalized office hours (VIEW - backed by calendar_event_templates)
// NOTE: After migration 0008, this is a VIEW with INSTEAD OF triggers for writes.
// Drizzle treats it as a table, which works because the view is writeable.
// The view maps to calendar_event_templates where event_type = 'OfficeHours'
export const courseOfficeHours = pgTable("course_office_hours", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").references(() => courses.id).notNull(),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sun ... 6=Sat
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  location: text("location")
}, (t) => ({
  idx_course_day: index("idx_office_hours_course_day").on(t.courseId, t.dayOfWeek)
}));

// Assignments
export const assignments = pgTable("assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  courseId: uuid("course_id").references(() => courses.id),
  title: text("title").notNull(),
  description: text("description"), // Migration 0029: User's original input/notes
  dueDate: timestamp("due_date", { withTimezone: true }),
  category: text("category"),
  effortEstimateMinutes: integer("effort_estimate_minutes"),
  priorityScore: integer("priority_score").default(0),
  status: assignmentStatusEnum("status").default("Inbox"),
  graded: boolean("graded").default(false),
  pointsEarned: numeric("points_earned", { precision: 10, scale: 2 }),
  pointsPossible: numeric("points_possible", { precision: 10, scale: 2 }),
  weightOverride: numeric("weight_override", { precision: 5, scale: 2 }),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  requiresChunking: boolean("requires_chunking").default(false), // Migration 0018: Auto-chunking for long-form work
  deferralCount: integer("deferral_count").default(0).notNull(), // Migration 0022: Wall of Awful tracking
  isStuck: boolean("is_stuck").default(false).notNull(), // Migration 0022: Flagged as stuck after 3 deferrals
  lastDeferredAt: timestamp("last_deferred_at", { withTimezone: true }), // Migration 0022: Most recent deferral timestamp
  stuckInterventionShown: boolean("stuck_intervention_shown").default(false).notNull(), // Migration 0022: Intervention prompt shown
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  idx_user_due: index("idx_assignments_user_due").on(t.userId, t.dueDate),
  idx_course_due: index("idx_assignments_course_due").on(t.courseId, t.dueDate),
  idx_chunking: index("idx_assignments_chunking").on(t.userId, t.requiresChunking).where(sql`requires_chunking = TRUE`), // Migration 0018
  idx_stuck: index("idx_assignments_stuck").on(t.userId, t.isStuck).where(sql`is_stuck = TRUE`) // Migration 0022: Quick queries for stuck assignments
}));

// Assignment Checklists - Migration 0024: Interactive checklists for stuck assignments
export const assignmentChecklists = pgTable("assignment_checklists", {
  id: uuid("id").primaryKey().defaultRandom(),
  assignmentId: uuid("assignment_id").references(() => assignments.id, { onDelete: 'cascade' }).notNull(),
  eventId: uuid("event_id").references(() => calendarEventsNew.id, { onDelete: 'cascade' }),
  items: jsonb("items").notNull(), // [{label: string, duration_minutes: number, completed: boolean}]
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true })
}, (t) => ({
  idx_assignment: index("idx_assignment_checklists_assignment").on(t.assignmentId),
  idx_event: index("idx_assignment_checklists_event").on(t.eventId),
  uniq_assignment: uniqueIndex("uniq_assignment_checklists_assignment").on(t.assignmentId)
}));

// Sessions (Focus/Chill)
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  assignmentId: uuid("assignment_id").references(() => assignments.id),
  type: sessionTypeEnum("type").notNull(),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  plannedDuration: integer("planned_duration"),
  actualDuration: integer("actual_duration"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  idx_user_start: index("idx_sessions_user_start").on(t.userId, t.startTime)
}));

// Calendar event templates (recurring patterns) - Migration 0008
export const calendarEventTemplates = pgTable("calendar_event_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  courseId: uuid("course_id").references(() => courses.id),
  eventType: eventTypeEnum("event_type").notNull(),
  rrule: text("rrule"), // Optional RRULE string for complex recurrence
  dayOfWeek: smallint("day_of_week"), // 0=Sun, 1=Mon, ..., 6=Sat
  startTimeLocal: time("start_time_local").notNull(), // Local time (no timezone)
  endTimeLocal: time("end_time_local").notNull(), // Local time (no timezone)
  startDate: date("start_date"), // Optional: when template starts being active
  endDate: date("end_date"), // Optional: when template expires
  location: text("location"),
  color: varchar("color", { length: 32 }),
  isMovable: boolean("is_movable").notNull().default(false),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  idx_user_course: index("idx_calendar_event_templates_user_course").on(t.userId, t.courseId),
  idx_event_type: index("idx_calendar_event_templates_type").on(t.eventType),
  idx_course_day: index("idx_calendar_event_templates_course_day").on(t.courseId, t.dayOfWeek)
}));

// Calendar event instances (new structure) - Migration 0008
export const calendarEventsNew = pgTable("calendar_events_new", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  courseId: uuid("course_id").references(() => courses.id),
  assignmentId: uuid("assignment_id").references(() => assignments.id),
  templateId: uuid("template_id").references(() => calendarEventTemplates.id), // Link to template
  linkedAssignmentId: uuid("linked_assignment_id").references(() => assignments.id), // PRIORITY 2: For deferral tracking
  title: text("title").notNull(),
  description: text("description"), // Migration 0030: Assignment description/notes
  eventType: eventTypeEnum("event_type").notNull(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(), // Changed from startTime for clarity
  endAt: timestamp("end_at", { withTimezone: true }).notNull(), // Changed from endTime for clarity
  isMovable: boolean("is_movable").notNull().default(true),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  idx_user_time: index("idx_calendar_events_new_user_time").on(t.userId, t.startAt, t.endAt),
  idx_course_time: index("idx_calendar_events_new_course_time").on(t.courseId, t.startAt),
  idx_template: index("idx_calendar_events_new_template").on(t.templateId),
  idx_movable: index("idx_calendar_events_new_movable").on(t.isMovable),
  idx_assignment: index("idx_calendar_events_new_assignment").on(t.assignmentId),
  idx_linked_assignment: index("idx_calendar_events_new_linked_assignment").on(t.linkedAssignmentId)
}));

// Calendar events (LEGACY - kept for backward compatibility during transition)
// NOTE: New code should use calendarEventsNew. This table will eventually be deprecated.
export const calendarEvents = pgTable("calendar_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  courseId: uuid("course_id").references(() => courses.id),
  assignmentId: uuid("assignment_id").references(() => assignments.id),
  type: eventTypeEnum("type").notNull(),
  title: text("title"),
  location: text("location"),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  isMovable: boolean("is_movable").default(false),
  isRecurring: boolean("is_recurring").default(false), // For Rebalancing Engine
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  idx_user_time: index("idx_events_user_time").on(t.userId, t.startTime)
}));

// Dashboard preferences
export const dashboardPreferences = pgTable("dashboard_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull().unique(),
  showGradeForecast: boolean("show_grade_forecast").notNull().default(true),
  showChillBank: boolean("show_chill_bank").notNull().default(true),
  defaultRange: text("default_range").notNull().default("week"), // 'day' | 'week'
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
});

// Daily productivity
export const userDailyProductivity = pgTable("user_daily_productivity", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  day: date("day").notNull(), // UTC date boundary
  focusMinutes: integer("focus_minutes").notNull().default(0),
  chillMinutes: integer("chill_minutes").notNull().default(0),
  earnedChillMinutes: integer("earned_chill_minutes").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  uniq_user_day: uniqueIndex("uniq_user_day").on(t.userId, t.day)
}));

// Weekly productivity (ISO week)
export const userWeeklyProductivity = pgTable("user_weekly_productivity", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  isoYear: integer("iso_year").notNull(),
  isoWeek: integer("iso_week").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  focusMinutes: integer("focus_minutes").notNull().default(0),
  chillMinutes: integer("chill_minutes").notNull().default(0),
  earnedChillMinutes: integer("earned_chill_minutes").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  uniq_user_week: uniqueIndex("uniq_user_week").on(t.userId, t.isoYear, t.isoWeek)
}));

// Streaks (multi-type support for Rebalancing Engine)
export const userStreaks = pgTable("user_streaks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  streakType: text("streak_type").notNull(), // 'productivity', 'login', etc.
  currentCount: integer("current_count").notNull().default(0),
  longestCount: integer("longest_count").notNull().default(0),
  lastIncrementedOn: date("last_incremented_on"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  uniq_user_streak_type: uniqueIndex("user_streaks_user_id_streak_type_key").on(t.userId, t.streakType),
  idx_user: index("idx_streaks_user").on(t.userId)
}));

// Grade forecasts per course
export const courseGradeForecasts = pgTable("course_grade_forecasts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  courseId: uuid("course_id").references(() => courses.id).notNull(),
  currentScore: numeric("current_score", { precision: 5, scale: 2 }),
  projectedScore: numeric("projected_score", { precision: 5, scale: 2 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  uniq_course: uniqueIndex("uniq_course_forecast").on(t.courseId)
}));

// Grading components (normalized grade breakdown) - Migration 0010
// Used for accurate grade calculations and Grade Forecast projections
export const gradingComponents = pgTable("grading_components", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull(),
  name: varchar("name", { length: 128 }).notNull(), // e.g., "Midterm", "Homework", "Final Exam"
  weightPercent: numeric("weight_percent", { precision: 5, scale: 2 }).notNull(), // 0.00 to 100.00
  dropLowest: smallint("drop_lowest"), // Optional: drop N lowest scores
  source: varchar("source", { length: 64 }), // 'syllabus', 'manual', 'imported'
  sourceItemId: uuid("source_item_id"), // Link to source if from syllabus staging
  parseRunId: uuid("parse_run_id").references(() => syllabusParseRuns.id), // Link to parse run if from syllabus
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  idx_course: index("idx_grading_components_course").on(t.courseId),
  idx_parse_run: index("idx_grading_components_parse_run").on(t.parseRunId)
}));

// Syllabus ingestion (staging + audit)
export const syllabusFiles = pgTable("syllabus_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  courseId: uuid("course_id").references(() => courses.id),
  path: text("path").notNull(),
  originalFilename: text("original_filename"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  idx_user_uploaded: index("idx_syllabus_files_user").on(t.userId, t.uploadedAt)
}));

export const syllabusParseRuns = pgTable("syllabus_parse_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  syllabusFileId: uuid("syllabus_file_id").references(() => syllabusFiles.id).notNull(),
  status: syllabusParseStatusEnum("status").notNull().default("queued"),
  model: text("model"),
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true })
}, (t) => ({
  idx_file_status: index("idx_parse_runs_file_status").on(t.syllabusFileId, t.status)
}));

export const syllabusStagingItems = pgTable("syllabus_staging_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  parseRunId: uuid("parse_run_id").references(() => syllabusParseRuns.id).notNull(),
  type: text("type").notNull(), // 'course' | 'office_hours' | 'grade_weights' | 'assignment' | 'class_schedule'
  payload: jsonb("payload").notNull(),
  confidence: numeric("confidence", { precision: 4, scale: 3 }), // Legacy field (kept for backward compatibility)
  confidenceScore: numeric("confidence_score", { precision: 4, scale: 3 }), // Migration 0011: Parser confidence (0.000–1.000)
  dedupeKey: text("dedupe_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  idx_run_type: index("idx_staging_run_type").on(t.parseRunId, t.type),
  idx_confidence: index("idx_staging_confidence").on(t.parseRunId, t.confidenceScore) // Migration 0011: For preview UI sorting
}));

export const syllabusCommits = pgTable("syllabus_commits", {
  id: uuid("id").primaryKey().defaultRandom(),
  parseRunId: uuid("parse_run_id").references(() => syllabusParseRuns.id).notNull(),
  committedBy: uuid("committed_by").references(() => users.id).notNull(),
  committedAt: timestamp("committed_at", { withTimezone: true }).defaultNow(),
  summary: jsonb("summary")
});

// User course aliases (for quick add parsing)
export const userCourseAliases = pgTable("user_course_aliases", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  alias: text("alias").notNull(),
  courseId: uuid("course_id").references(() => courses.id).notNull(),
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
  usageCount: integer("usage_count").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  idx_course: index("idx_user_course_aliases_course").on(t.courseId)
  // CI unique (user_id, lower(alias)) is added via SQL migration
}));

// Quick add logs (for parsing and deduplication)
export const quickAddLogs = pgTable("quick_add_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  rawInput: text("raw_input").notNull(),
  parsedPayload: jsonb("parsed_payload"),
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
  dedupeHash: text("dedupe_hash"),
  createdAssignmentId: uuid("created_assignment_id").references(() => assignments.id),
  createdEventId: uuid("created_event_id").references(() => calendarEventsNew.id),
  intent: text("intent"), // 'event' | 'assignment' | 'ambiguous'
  ambiguityReason: text("ambiguity_reason"),
  userResolution: text("user_resolution"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  idx_user_date: index("idx_quick_add_logs_user_date").on(t.userId, t.createdAt),
  idx_dedupe: uniqueIndex("idx_quick_add_dedupe").on(t.userId, t.dedupeHash).where(sql`dedupe_hash IS NOT NULL`)
}));

// Rebalancing Engine: Proposals (Migration 0013_5)
export const rebalancingProposals = pgTable("rebalancing_proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  trigger: text("trigger").notNull(), // 'manual' | 'quick_add' | 'schedule_drift' | 'morning_refresh' | 'other'
  cause: jsonb("cause"), // optional context: { assignment_id, inserted_event_id, reason }
  energyLevel: smallint("energy_level"), // 1–10 captured at run time
  movesCount: integer("moves_count").notNull().default(0),
  churnCostTotal: integer("churn_cost_total").notNull().default(0), // minutes (or normalized score)
  status: text("status").notNull().default("proposed"), // 'proposed' | 'applied' | 'partially_applied' | 'cancelled' | 'expired'
  applyModeRequireAll: boolean("apply_mode_require_all").notNull().default(false), // if true, any conflict → 409 and no changes
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  undoneAt: timestamp("undone_at", { withTimezone: true }),
  snapshotId: uuid("snapshot_id"), // FK to rollback_snapshots (added in migration 0015)
  idempotencyKey: text("idempotency_key"), // for confirm/undo safety
  metadata: jsonb("metadata") // { reason_codes_agg, performance_ms, heuristics_version }
}, (t) => ({
  idx_user_created: index("idx_rebalance_user_created").on(t.userId, t.createdAt),
  idx_status: index("idx_rebalance_status").on(t.userId, t.status, t.createdAt),
  uq_idem: uniqueIndex("uq_rebalance_idem").on(t.userId, t.idempotencyKey).where(sql`idempotency_key IS NOT NULL`)
}));

// Rebalancing Engine: Proposal Moves (Migration 0013_5, 0014)
export const proposalMoves = pgTable("proposal_moves", {
  id: uuid("id").primaryKey().defaultRandom(),
  proposalId: uuid("proposal_id").references(() => rebalancingProposals.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  moveType: text("move_type").notNull(), // 'insert' | 'move' | 'resize' | 'delete'
  sourceEventId: uuid("source_event_id").references(() => calendarEventsNew.id, { onDelete: "set null" }), // FK added in migration 0014_5
  targetStartAt: timestamp("target_start_at", { withTimezone: true }),
  targetEndAt: timestamp("target_end_at", { withTimezone: true }),
  deltaMinutes: integer("delta_minutes"), // positive for pushes/pulls
  churnCost: integer("churn_cost").notNull().default(0),
  category: text("category"), // 'deep_work' | 'standard' | 'light' | 'admin' | 'chore'
  reasonCodes: jsonb("reason_codes").notNull().default(sql`'[]'::jsonb`), // array of codes, e.g., ["DEADLINE_PROXIMITY","QUIET_HOURS"]
  basePriority: numeric("base_priority", { precision: 6, scale: 3 }),
  energyMultiplier: numeric("energy_multiplier", { precision: 4, scale: 2 }),
  finalPriority: numeric("final_priority", { precision: 6, scale: 3 }),
  feasibilityFlags: jsonb("feasibility_flags"), // { buffer_enforced:true, protected_window:false, ... }
  baselineUpdatedAt: timestamp("baseline_updated_at", { withTimezone: true }), // Added in migration 0014
  baselineVersion: integer("baseline_version"), // Added in migration 0014
  metadata: jsonb("metadata"), // Added in migration 0014 - for assignment/calendar event linkage
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  idx_proposal: index("idx_proposal_moves_proposal").on(t.proposalId),
  idx_source: index("idx_proposal_moves_source").on(t.sourceEventId),
  idx_metadata_gin: index("idx_proposal_moves_metadata_gin").using("gin", t.metadata),
  idx_moves_assignment: index("idx_moves_assignment").on(sql`(metadata->>'assignment_id')`)
}));

// Rebalancing Engine: Rollback Snapshots (Migration 0015)
export const rollbackSnapshots = pgTable("rollback_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  proposalId: uuid("proposal_id").references(() => rebalancingProposals.id, { onDelete: "cascade" }).notNull().unique(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  payload: jsonb("payload").notNull(), // Array of { event_id, start_at, end_at, metadata }
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  idx_user_created: index("idx_snapshots_user_created").on(t.userId, t.createdAt)
}));

// Rebalancing Engine: Churn Ledger (Migration 0016)
export const churnLedger = pgTable("churn_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  day: date("day").notNull(), // user's local date
  minutesMoved: integer("minutes_moved").default(0),
  movesCount: integer("moves_count").default(0),
  capMinutes: integer("cap_minutes"), // snapshot of cap at the time (nullable)
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  uniq_user_day: uniqueIndex("churn_ledger_user_id_day_key").on(t.userId, t.day),
  idx_user_day: index("idx_churn_ledger_user_day").on(t.userId, t.day)
}));

// Rebalancing Engine: Churn Settings (Migration 0016)
export const churnSettings = pgTable("churn_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
  dailyCapMinutes: integer("daily_cap_minutes").default(60),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  idx_user: index("idx_churn_settings_user").on(t.userId)
}));

// Rebalancing Engine: Apply Attempts (Migration 0017)
export const rebalancingApplyAttempts = pgTable("rebalancing_apply_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  proposalId: uuid("proposal_id").references(() => rebalancingProposals.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  attemptNo: integer("attempt_no").notNull(),
  operation: text("operation").notNull(), // 'confirm' | 'undo'
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: text("status").notNull(), // 'success' | 'partial_success' | 'stale_conflict' | 'failed'
  idempotencyKey: text("idempotency_key"), // For at-most-once delivery of apply/undo requests
  conflicts: jsonb("conflicts"), // Details on which events were stale: [{ eventId, expectedUpdatedAt, actualUpdatedAt, reason }]
  error: text("error"),
  resultSummary: jsonb("result_summary") // { "applied": n, "skipped": m, "churn_applied": x }
}, (t) => ({
  idx_proposal: index("idx_apply_attempts_proposal").on(t.proposalId, t.attemptNo),
  idx_status: index("idx_apply_attempts_status").on(t.userId, t.status, t.startedAt)
}));

// Post-Class Nudges: Class Nudges (PRD-Post-Class-Nudge-Database)
export const classNudges = pgTable("class_nudges", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  courseId: uuid("course_id").references(() => courses.id, { onDelete: "cascade" }),
  classDate: date("class_date").notNull(), // local class day anchoring the nudge
  deliveryChannel: text("delivery_channel"), // 'push' | 'summary'
  requiresLogisticsPrompt: boolean("requires_logistics_prompt").notNull().default(true),
  promptText: text("prompt_text"), // e.g., "Did the teacher mention any new due dates or tests?"
  status: text("status").notNull().default("pending"), // 'pending' | 'resolved' | 'deferred' | 'muted'
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }), // when it should be sent (post-class or morning summary)
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  responseType: text("response_type"), // 'no_updates' | 'log_focus' | 'add_assignment' | 'defer' | 'mute_course'
  responseAt: timestamp("response_at", { withTimezone: true }),
  resolvedByEventId: uuid("resolved_by_event_id").references(() => calendarEventsNew.id, { onDelete: "set null" }), // set when log_focus creates a Focus event
  responseReason: text("response_reason"), // optional free-form or reason code
  responsePayload: jsonb("response_payload"), // normalized details captured at resolve time
  notes: jsonb("notes"), // includes logistics prompt outcome, attachments pointers, survey, and any ad-hoc annotations
  dedupeHash: text("dedupe_hash") // optional fingerprint for de-duping repeated pushes
}, (t) => ({
  uniq_user_course_date: uniqueIndex("class_nudges_user_course_date_key").on(t.userId, t.courseId, t.classDate),
  idx_user_created: index("idx_class_nudges_user_created").on(t.userId, t.createdAt),
  idx_user_status: index("idx_class_nudges_user_status").on(t.userId, t.status),
  idx_user_scheduled: index("idx_class_nudges_user_scheduled").on(t.userId, t.scheduledAt),
  idx_notes_gin: index("idx_class_nudges_notes_gin").using("gin", t.notes)
}));

// Post-Class Nudges: Nudge Groups (PRD-Post-Class-Nudge-Database)
export const nudgeGroups = pgTable("nudge_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  groupDate: date("group_date").notNull(),
  groupType: text("group_type").notNull(), // 'post_class_stack'
  reason: text("reason"), // e.g., 'back_to_back'
  itemsCount: integer("items_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  idx_user_date: index("idx_nudge_groups_user_date").on(t.userId, t.groupDate)
}));

// Post-Class Nudges: Nudge Group Items (PRD-Post-Class-Nudge-Database)
export const nudgeGroupItems = pgTable("nudge_group_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id").references(() => nudgeGroups.id, { onDelete: "cascade" }).notNull(),
  nudgeId: uuid("nudge_id").references(() => classNudges.id, { onDelete: "cascade" }).notNull(),
  position: integer("position").notNull()
}, (t) => ({
  idx_group_position: index("idx_group_items_group").on(t.groupId, t.position),
  idx_nudge: index("idx_group_items_nudge").on(t.nudgeId)
}));

// Post-Class Nudges: Delivery Attempts (PRD-Post-Class-Nudge-Database)
export const nudgeDeliveryAttempts = pgTable("nudge_delivery_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  nudgeId: uuid("nudge_id").references(() => classNudges.id, { onDelete: "cascade" }).notNull(),
  attemptNo: integer("attempt_no").notNull(),
  channel: text("channel").notNull(), // 'push' | 'summary'
  provider: text("provider"), // e.g., 'onesignal'
  sentAt: timestamp("sent_at", { withTimezone: true }),
  status: text("status").notNull(), // 'queued' | 'sent' | 'failed' | 'throttled'
  providerMessageId: text("provider_message_id"),
  error: text("error"),
  payload: jsonb("payload") // final push payload snapshot for traceability
}, (t) => ({
  idx_nudge_attempt: index("idx_delivery_nudge_attempt").on(t.nudgeId, t.attemptNo),
  idx_status: index("idx_delivery_status").on(t.status, t.sentAt)
}));

// Post-Class Nudges: Course Nudge Settings (PRD-Post-Class-Nudge-Database)
export const courseNudgeSettings = pgTable("course_nudge_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  courseId: uuid("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull(),
  muted: boolean("muted").notNull().default(false),
  cooldownMinutes: integer("cooldown_minutes"), // min minutes between nudges of the same course
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  uniq_user_course: uniqueIndex("uq_course_nudge_settings").on(t.userId, t.courseId),
  idx_user: index("idx_course_nudge_user").on(t.userId)
}));

// Post-Class Nudges: User Notification Preferences (PRD-Post-Class-Nudge-Database)
export const userNotificationPrefs = pgTable("user_notification_prefs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
  pushEnabled: boolean("push_enabled").default(true),
  quietHoursStart: time("quiet_hours_start"), // TIME, nullable
  quietHoursEnd: time("quiet_hours_end"), // TIME, nullable
  dndMode: boolean("dnd_mode").default(false), // suppresses push; routed to morning summary
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  uniq_user: uniqueIndex("uq_notification_prefs_user").on(t.userId)
}));

// ===== SIMPLIFIED POST-CLASS NUDGES (MVP Implementation) =====
// Simpler than PRD - for rapid launch

// Nudges table (simplified MVP version)
export const nudges = pgTable("nudges", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  courseId: uuid("course_id").references(() => courses.id, { onDelete: "cascade" }).notNull(),
  type: text("type").notNull().default("POST_CLASS"),
  status: text("status").notNull().default("queued"), // queued, deferred, sent, delivered, resolved, expired
  triggerAt: timestamp("trigger_at", { withTimezone: true }).notNull(),
  scheduledSendAt: timestamp("scheduled_send_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  responseAt: timestamp("response_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull().default(sql`NOW() + INTERVAL '48 hours'`),
  deliveryChannel: text("delivery_channel"), // push, in_app
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  idxUserStatus: index("idx_nudges_user_status").on(t.userId, t.status),
  idxTriggerAt: index("idx_nudges_trigger_at").on(t.triggerAt)
}));

// Nudge actions table
export const nudgeActions = pgTable("nudge_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  nudgeId: uuid("nudge_id").references(() => nudges.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  action: text("action").notNull(), // NO_UPDATES, ADD_ASSIGNMENT, LOG_FOCUS, DISMISSED
  payload: jsonb("payload").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  idxNudge: index("idx_nudge_actions_nudge").on(t.nudgeId),
  idxUser: index("idx_nudge_actions_user").on(t.userId, t.createdAt)
}));

// Streak counters table
export const streakCounters = pgTable("streak_counters", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastActionDate: date("last_action_date"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  idxUser: index("idx_streak_counters_user").on(t.userId)
}));

// Daily deep work summary (Migration 0022) - Recovery Forcing
// Tracks total deep work hours per day to enforce 4-hour limit
export const dailyDeepWorkSummary = pgTable("daily_deep_work_summary", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  date: date("date").notNull(),
  totalDeepWorkMinutes: integer("total_deep_work_minutes").notNull().default(0),
  recoveryForced: boolean("recovery_forced").notNull().default(false), // TRUE if we blocked scheduling (>4hr)
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  uniqUserDate: uniqueIndex("daily_deep_work_summary_user_id_date_key").on(t.userId, t.date),
  idxUserDate: index("idx_daily_deep_work_user_date").on(t.userId, t.date)
}));

// Assignment deferrals (Migration 0022) - Wall of Awful Detection
// Tracks every time an assignment is deferred (rescheduled/postponed)
export const assignmentDeferrals = pgTable("assignment_deferrals", {
  id: uuid("id").primaryKey().defaultRandom(),
  assignmentId: uuid("assignment_id").references(() => assignments.id, { onDelete: "cascade" }).notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  deferredFrom: timestamp("deferred_from", { withTimezone: true }).notNull(), // Original scheduled time
  deferredTo: timestamp("deferred_to", { withTimezone: true }), // New scheduled time (NULL if unscheduled)
  reason: text("reason"), // Optional: User-provided reason
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  idxAssignment: index("idx_deferrals_assignment").on(t.assignmentId, t.createdAt),
  idxUser: index("idx_deferrals_user").on(t.userId, t.createdAt)
}));
