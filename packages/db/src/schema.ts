import { pgTable, uuid, text, integer, timestamp, boolean, jsonb, pgEnum, index } from "drizzle-orm/pg-core";

export const assignmentStatusEnum = pgEnum("assignment_status", ["Inbox","Scheduled","Locked_In","Completed"]);
export const sessionTypeEnum = pgEnum("session_type", ["Focus","Chill"]);
export const eventTypeEnum = pgEnum("event_type", ["Class","Work","OfficeHours","Focus","Chill","Other"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  targetStudyRatio: integer("target_study_ratio").default(25),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  idx_clerk: index("idx_users_clerk").on(t.clerkUserId)
}));

export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  professor: text("professor"),
  colorCode: text("color_code"),
  credits: integer("credits").default(3),
  scheduleJson: jsonb("schedule_json"),
  officeHoursJson: jsonb("office_hours_json"),
  gradeWeightsJson: jsonb("grade_weights_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  idx_user_name: index("idx_courses_user_name").on(t.userId, t.name)
}));

export const assignments = pgTable("assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  courseId: uuid("course_id").references(() => courses.id),
  title: text("title").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  category: text("category"),
  effortEstimateMinutes: integer("effort_estimate_minutes"),
  priorityScore: integer("priority_score").default(0),
  status: assignmentStatusEnum("status").default("Inbox"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  idx_user_due: index("idx_assignments_user_due").on(t.userId, t.dueDate)
}));

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
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow()
}, (t) => ({
  idx_user_time: index("idx_events_user_time").on(t.userId, t.startTime)
}));
